import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  UsePipes,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { LoginDto, PairDto, RevokeDeviceDto } from '@zeiterfassung/shared';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(LoginDto))
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(body.email, body.password);

    this.setRefreshCookie(res, result.refreshToken);

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken, // Mobile liest aus Body, Web nutzt Cookie
      expiresIn: result.expiresIn,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Try cookie first, then header (for mobile)
    const refreshToken =
      req.cookies?.refreshToken ||
      req.headers['x-refresh-token'] as string;

    if (!refreshToken) {
      res.status(401).json({ message: 'No refresh token' });
      return;
    }

    const result = await this.authService.refresh(refreshToken);

    // Only set cookie if original token came from cookie
    if (req.cookies?.refreshToken) {
      this.setRefreshCookie(res, result.refreshToken);
    }

    return {
      accessToken: result.accessToken,
      refreshToken: req.cookies?.refreshToken ? undefined : result.refreshToken,
      expiresIn: result.expiresIn,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken =
      req.cookies?.refreshToken ||
      req.headers['x-refresh-token'] as string;

    await this.authService.logout(refreshToken);

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/auth',
    });
  }

  @Post('pairing-token')
  @HttpCode(HttpStatus.CREATED)
  async createPairingToken(@CurrentUser() user: JwtPayload) {
    return this.authService.createPairingToken(user.sub);
  }

  @Public()
  @Post('pair')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(PairDto))
  async pair(@Body() body: PairDto) {
    const result = await this.authService.pairDevice(
      body.token,
      body.deviceName,
      body.platform as any,
    );

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
    };
  }

  @Post('revoke-device')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UsePipes(new ZodValidationPipe(RevokeDeviceDto))
  async revokeDevice(
    @Body() body: RevokeDeviceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authService.revokeDevice(body.deviceId, user.sub);
  }

  // ── Helpers ─────────────────────────────────────

  private setRefreshCookie(res: Response, refreshToken: string) {
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  }
}
