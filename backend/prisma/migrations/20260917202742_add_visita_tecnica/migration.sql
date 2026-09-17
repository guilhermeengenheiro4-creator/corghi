-- CreateTable
CREATE TABLE "VisitaTecnica" (
    "id" TEXT NOT NULL,
    "representante" TEXT,
    "cliente" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "nf" TEXT,
    "data" TIMESTAMP(3),
    "contato" TEXT,
    "telefone" TEXT,
    "celular" TEXT,
    "email" TEXT,
    "horaInicio" TEXT,
    "dataInicio" TIMESTAMP(3),
    "equipamentoCategoria" "EquipamentoCategoria" NOT NULL,
    "modelo" TEXT,
    "numeroSerie" TEXT,
    "treinamentos" JSONB,
    "horaTermino" TEXT,
    "dataTermino" TIMESTAMP(3),
    "parecerCliente" TEXT,
    "tecnicoResponsavel" TEXT,
    "dataAssinatura" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitaTecnica_pkey" PRIMARY KEY ("id")
);
