import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UsePipes,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UserRole, CreateUserDto, UpdateUserDto } from '@zeiterfassung/shared';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.DISPO)
  findAll() {
    return this.usersService.findAll();
  }

  @Get('me')
  findMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.findMe(user.sub);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @UsePipes(new ZodValidationPipe(CreateUserDto))
  create(@Body() body: CreateUserDto, @CurrentUser() user: JwtPayload) {
    return this.usersService.create(body, user.sub);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @UsePipes(new ZodValidationPipe(UpdateUserDto))
  update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.update(id, body, user.sub);
  }

  @Post(':id/deactivate')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.usersService.deactivate(id, user.sub);
  }

  @Get(':id/devices')
  @Roles(UserRole.ADMIN, UserRole.DISPO)
  getDevices(@Param('id') id: string) {
    return this.usersService.getDevices(id);
  }
}
