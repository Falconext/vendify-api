const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const u = await p.usuario.findUnique({ where:{id:4}, select:{id:true,rol:true,estado:true,empresaId:true} });
  console.log('user4=', JSON.stringify(u));
  const e = await p.empresa.findUnique({ where:{id:2}, select:{estado:true, fechaExpiracion:true} });
  console.log('empresa2=', JSON.stringify(e), 'now=', new Date().toISOString());
  await p.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
