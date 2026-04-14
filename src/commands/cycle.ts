export async function cycle(plan?: string, projectDir?: string) {
  const { main } = await import('../../cycle/index.js');
  await main(plan, projectDir);
}
