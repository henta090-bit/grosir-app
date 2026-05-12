import supabaseAdmin from './supabaseAdmin.js';

const truncateSql = `
  truncate table
    public.stock_counts,
    public.stock_movements,
    public.products
  restart identity cascade;
`;

async function resetDb() {
  console.log('[reset-db] Memulai reset database...');

  const { error } = await supabaseAdmin.rpc('exec_sql', {
    sql: truncateSql,
  });

  if (error) {
    console.error('[reset-db] Gagal reset database.');
    console.error('[reset-db] Detail error:', error.message);
    process.exitCode = 1;
    return;
  }

  console.log(
    '[reset-db] Berhasil truncate public.stock_counts, public.stock_movements, dan public.products dengan RESTART IDENTITY CASCADE.'
  );
}

resetDb().catch((error) => {
  console.error('[reset-db] Terjadi error tak terduga.');
  console.error('[reset-db] Detail error:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
