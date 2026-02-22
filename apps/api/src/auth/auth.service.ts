import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
import { DevicePlatform } from '@zeiterfassung/shared';

@Injectable()
export class AuthService {
  private readonly accessTokenTtl: number;
  private readonly refreshTokenTtl: number;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private audit: AuditService,
  ) {
    this.accessTokenTtl = parseInt(this.config.get('ACCESS_TOKEN_TTL_SECONDS', '900'), 10); // 15 min
    this.refreshTokenTtl = parseInt(this.config.get('REFRESH_TOKEN_TTL_DAYS', '30'), 10);
  }

  // ── Login ─────────────────────────────────────────

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Create or update web device
    let device = await this.prisma.device.findFirst({
      where: { userId: user.id, platform: 'WEB', revokedAt: null },
    });

    if (!device) {
      device = await this.prisma.device.create({
        data: {
          userId: user.id,
          deviceName: 'Web Browser',
          platform: 'WEB',
        },
      });
    } else {
      await this.prisma.device.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date() },
      });
    }

    return this.issueTokens(user.id, user.email, user.role, device.id);
  }

  // ── Refresh ───────────────────────────────────────

  async refresh(refreshTokenRaw: string) {
    const tokenHash = this.hashToken(refreshTokenRaw);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true, device: true },
    });

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!storedToken.user.isActive) {
      throw new UnauthorizedException('User inactive');
    }

    if (storedToken.device?.revokedAt) {
      throw new UnauthorizedException('Device revoked');
    }

    // Token rotation: revoke old, issue new
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    // Update device last seen
    if (storedToken.deviceId) {
      await this.prisma.device.update({
        where: { id: storedToken.deviceId },
        data: { lastSeenAt: new Date() },
      });
    }

    return this.issueTokens(
      storedToken.userId,
      storedToken.user.email,
      storedToken.user.role,
      storedToken.deviceId ?? undefined,
    );
  }

  // ── Logout ────────────────────────────────────────

  async logout(refreshTokenRaw: string) {
    if (!refreshTokenRaw) return;

    const tokenHash = this.hashToken(refreshTokenRaw);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ── Pairing Token ─────────────────────────────────

  async createPairingToken(userId: string) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 60_000); // 60 seconds

    const pairingToken = await this.prisma.pairingToken.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });

    return { token: pairingToken.token, expiresAt: pairingToken.expiresAt };
  }

  // ── Pair Device ───────────────────────────────────

  async pairDevice(token: string, deviceName: string, platform: DevicePlatform) {
    const pairingToken = await this.prisma.pairingToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!pairingToken) {
      throw new BadRequestException('Invalid pairing token');
    }

    if (pairingToken.usedAt) {
      throw new ConflictException('Pairing token already used');
    }

    if (pairingToken.expiresAt < new Date()) {
      throw new BadRequestException('Pairing token expired');
    }

    if (!pairingToken.user.isActive) {
      throw new UnauthorizedException('User inactive');
    }

    // Mark token as used
    await this.prisma.pairingToken.update({
      where: { id: pairingToken.id },
      data: { usedAt: new Date() },
    });

    // Create device
    const device = await this.prisma.device.create({
      data: {
        userId: pairingToken.userId,
        deviceName,
        platform,
      },
    });

    await this.audit.log({
      entityType: 'Device',
      entityId: device.id,
      action: 'CREATE',
      actorUserId: pairingToken.userId,
      payload: { deviceName, platform },
    });

    return this.issueTokens(
      pairingToken.userId,
      pairingToken.user.email,
      pairingToken.user.role,
      device.id,
    );
  }

  // ── Revoke Device ─────────────────────────────────

  async revokeDevice(deviceId: string, actorUserId: string) {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });

    if (!device) {
      throw new BadRequestException('Device not found');
    }

    // Revoke device
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { revokedAt: new Date() },
    });

    // Revoke all refresh tokens for this device
    await this.prisma.refreshToken.updateMany({
      where: { deviceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.audit.log({
      entityType: 'Device',
      entityId: deviceId,
      action: 'REVOKE_DEVICE',
      actorUserId,
      payload: { deviceName: device.deviceName },
    });
  }

  // ── Token helpers ─────────────────────────────────

  private async issueTokens(userId: string, email: string, role: string, deviceId?: string) {
    const payload: JwtPayload = {
      sub: userId,
      email,
      role,
      ...(deviceId && { deviceId }),
    };

    const accessToken = this.jwt.sign(payload, {
      expiresIn: this.accessTokenTtl,
    });

    const refreshTokenRaw = crypto.randomBytes(48).toString('base64url');
    const tokenHash = this.hashToken(refreshTokenRaw);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        deviceId: deviceId ?? null,
        tokenHash,
        expiresAt: new Date(Date.now() + this.refreshTokenTtl * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      expiresIn: this.accessTokenTtl,
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // ── Password hashing ─────────────────────────────

  static async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }
}
