-- CreateTable
CREATE TABLE "Producao" (
    "id" TEXT NOT NULL,
    "equipamento" TEXT NOT NULL,
    "codigo" TEXT,
    "numeroSerie" TEXT,
    "quemProduziu" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Producao_pkey" PRIMARY KEY ("id")
);
