-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('ADMIN', 'TECNICO');

-- CreateEnum
CREATE TYPE "EquipamentoCategoria" AS ENUM ('ALINHADORA', 'BALANCEADORA', 'DESMONTADORA', 'RAMPA', 'ELEVADOR', 'RECICLADORA', 'RETIFICADORA', 'OUTROS');

-- CreateEnum
CREATE TYPE "Situacao" AS ENUM ('ABERTO', 'ORCAMENTO', 'SEM_RETORNO', 'OUTROS', 'DEVENDO', 'RESOLVIDO');

-- CreateEnum
CREATE TYPE "OrcamentoStatus" AS ENUM ('A_MONTAR', 'ENVIADO', 'APROVADO', 'REPROVADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "SituacaoFinanceira" AS ENUM ('NAO_VERIFICADO', 'SEM_PENDENCIA', 'PENDENCIA_ENCONTRADA');

-- CreateEnum
CREATE TYPE "TarefaStatus" AS ENUM ('PENDENTE', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "TipoVisita" AS ENUM ('SHOWROOM', 'CAMPO');

-- CreateEnum
CREATE TYPE "PinturaStatus" AS ENUM ('AGUARDANDO', 'EM_PINTURA', 'CONCLUIDO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" "Papel" NOT NULL DEFAULT 'TECNICO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chamado" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "responsavel" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "cliente" TEXT NOT NULL,
    "contato" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "nf" TEXT,
    "representante" TEXT,
    "garantia" BOOLEAN NOT NULL DEFAULT false,
    "italiaAjuda" BOOLEAN NOT NULL DEFAULT false,
    "equipamentoCategoria" "EquipamentoCategoria" NOT NULL,
    "modelo" TEXT,
    "serie" TEXT,
    "assunto" TEXT NOT NULL,
    "acoesRealizadas" TEXT,
    "conclusao" TEXT,
    "situacao" "Situacao" NOT NULL DEFAULT 'ABERTO',
    "dataFechamento" TIMESTAMP(3),
    "orcamentoStatus" "OrcamentoStatus",
    "cnpj" TEXT,
    "situacaoFinanceira" "SituacaoFinanceira" NOT NULL DEFAULT 'NAO_VERIFICADO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chamado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rme" (
    "id" TEXT NOT NULL,
    "nf" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "representante" TEXT,
    "tecnico" TEXT,
    "valor" DECIMAL(12,2),
    "relatorio" TEXT,
    "rmeData" TIMESTAMP(3),
    "retornoData" TIMESTAMP(3),
    "montagemData" TIMESTAMP(3),
    "cancelado" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerieReferencia" (
    "id" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "nf" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "modelo" TEXT,
    "dataVenda" TIMESTAMP(3),

    CONSTRAINT "SerieReferencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tarefa" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "atribuidoParaId" TEXT NOT NULL,
    "atribuidoPorId" TEXT NOT NULL,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prazo" TIMESTAMP(3),
    "status" "TarefaStatus" NOT NULL DEFAULT 'PENDENTE',
    "dataConclusao" TIMESTAMP(3),
    "observacao" TEXT,

    CONSTRAINT "Tarefa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitaAgenda" (
    "id" TEXT NOT NULL,
    "tipo" "TipoVisita" NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "hora" TEXT,
    "representante" TEXT,
    "responsavel" TEXT,
    "linha" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitaAgenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContadorChamado" (
    "ano" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContadorChamado_pkey" PRIMARY KEY ("ano")
);

-- CreateTable
CREATE TABLE "Pintura" (
    "id" TEXT NOT NULL,
    "equipamento" TEXT NOT NULL,
    "serie" TEXT,
    "cliente" TEXT,
    "status" "PinturaStatus" NOT NULL DEFAULT 'AGUARDANDO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pintura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Chamado_numero_key" ON "Chamado"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "SerieReferencia_serie_key" ON "SerieReferencia"("serie");

-- AddForeignKey
ALTER TABLE "Tarefa" ADD CONSTRAINT "Tarefa_atribuidoParaId_fkey" FOREIGN KEY ("atribuidoParaId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarefa" ADD CONSTRAINT "Tarefa_atribuidoPorId_fkey" FOREIGN KEY ("atribuidoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
