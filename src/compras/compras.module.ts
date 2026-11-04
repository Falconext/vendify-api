import { Module } from '@nestjs/common';
import { TipoCambioModule } from '../tipo-cambio/tipo-cambio.module';
import { ComprasController } from './compras.controller';
import { ComprasService } from './compras.service';
import { ImportarComprasService } from './importar-compras.service';
import { ClienteModule } from '../cliente/cliente.module';
import { PrismaModule } from '../prisma/prisma.module';
import { KardexModule } from '../kardex/kardex.module';
import { ProductoModule } from '../producto/producto.module';
import { ComprobanteModule } from '../comprobante/comprobante.module';
import { GeminiModule } from '../gemini/gemini.module';
import { S3Module } from '../s3/s3.module';
import { OrdenCompraController } from './orden-compra.controller';
import { OrdenCompraService } from './orden-compra.service';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { CostoReposicionController } from './costo-reposicion.controller';
import { CostoReposicionService } from './costo-reposicion.service';

@Module({
  imports: [PrismaModule, KardexModule, ProductoModule, ComprobanteModule, GeminiModule, S3Module, ClienteModule, TipoCambioModule, NotificacionesModule],
  controllers: [OrdenCompraController, CostoReposicionController, ComprasController],
  providers: [ComprasService, OrdenCompraService, ImportarComprasService, CostoReposicionService],
})
export class ComprasModule {}
