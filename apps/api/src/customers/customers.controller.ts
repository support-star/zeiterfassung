import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UsePipes,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CreateCustomerDto, UpdateCustomerDto } from '@zeiterfassung/shared';

@Controller('customers')
export class CustomersController {
  constructor(private customersService: CustomersService) {}

  @Get()
  findAll() {
    return this.customersService.findAll();
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateCustomerDto))
  create(@Body() body: CreateCustomerDto, @CurrentUser() user: JwtPayload) {
    return this.customersService.create(body, user.sub);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(UpdateCustomerDto))
  update(
    @Param('id') id: string,
    @Body() body: UpdateCustomerDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.customersService.update(id, body, user.sub);
  }

  @Get(':id/projects')
  getProjects(@Param('id') id: string) {
    return this.customersService.getProjects(id);
  }
}
