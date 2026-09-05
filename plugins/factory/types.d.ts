// Loose local types for the function-hooks runtime. The engine ships no .d.ts (API.md
// "Not confirmed"), so everything the plugin touches is declared here and nothing else.

type FactoryAny = any;

interface FactoryOps {
  tool: {
    register(spec: { name: string; description: string; inputSchema: FactoryAny }): FactoryAny;
  };
  ui: {
    ask(question: string, options?: FactoryAny): FactoryAny;
    status(arg?: { text?: string }): FactoryAny;
    log(arg: { text: string }): FactoryAny;
  };
  fs: {
    readFile(path: string): FactoryAny;
    writeFile(path: string, content: string): FactoryAny;
    listDir(path: string): FactoryAny;
    exists(path: string): FactoryAny;
  };
  session: {
    cwd(): FactoryAny;
  };
}

/** `e` fields per event are unconfirmed, so the tool input is read defensively. */
interface FactoryEvent {
  input?: FactoryAny;
  arguments?: FactoryAny;
  args?: FactoryAny;
  tool?: string;
  [key: string]: FactoryAny;
}

type FactoryHook = ($: FactoryOps, e: FactoryEvent) => FactoryAny;

interface FactoryOn {
  (event: string, hook: FactoryHook): void;
  (event: string, matcher: Record<string, string>, hook: FactoryHook): void;
}

interface FactoryRegisterOptions {
  signal?: AbortSignal;
}
