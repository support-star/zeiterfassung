import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CreateProjectDto, UpdateProjectDto } from '@zeiterfassung/shared';

@Controller('projects')
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Get()
  findAll(@Query('customerId') customerId?: string) {
    return this.projectsService.findAll(customerId);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateProjectDto))
  create(@Body() body: CreateProjectDto, @CurrentUser() user: JwtPayload) {
    return this.projectsService.create(body, user.sub);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(UpdateProjectDto))
  update(
    @Param('id') id: string,
    @Body() body: UpdateProjectDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectsService.update(id, body, user.sub);
  }
}
