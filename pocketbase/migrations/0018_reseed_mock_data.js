/// <reference path="../pb_data/types.d.ts" />
// 0018_reseed_mock_data — NEUTRALIZADA (no-op).
// Esta migration era um seed escrito contra um schema antigo: gravava
// objective com valores invalidos ('conversions'/'reach') num campo
// select, e gravava texto em campos relation (account_id = 'act_...'),
// o que quebrava o clone do template com
// "objective: Invalid value conversions" e
// "account_id: Failed to find all relation records with the provided ids".
// O seed correto e idempotente e feito pela migration 0020_fix_demo_seed
// (objetivos validos + relation por .id). Mantida apenas como no-op p/ nao
// quebrar o historico de versoes ja aplicadas.
migrate(
  (app) => {
    // no-op: substituida pela 0020_fix_demo_seed
  },
  (app) => {
    /* no rollback */
  },
)
