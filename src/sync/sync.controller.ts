import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncBackupDto } from './dto/sync-backup.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  /**
   * POST /api/sync/backup
   * Recibe el backup completo desde el móvil y lo procesa
   */
  @Post('backup')
  @HttpCode(HttpStatus.OK)
  async uploadBackup(@Body() backup: SyncBackupDto, @Request() req) {
    const empresaId = req.user.empresaId;

    if (!empresaId) {
      return {
        success: false,
        message: 'Usuario no tiene empresa asociada',
      };
    }

    return await this.syncService.processBackup(backup, empresaId);
  }

  /**
   * GET /api/sync/status
   * Obtiene el estado de sincronización
   */
  @Get('status')
  async getSyncStatus(@Request() req) {
    const empresaId = req.user.empresaId;

    if (!empresaId) {
      return {
        lastSync: null,
        pendingItems: 0,
      };
    }

    return await this.syncService.getSyncStatus(empresaId);
  }
}
