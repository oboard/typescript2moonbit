import { useEffect, useRef, useContext } from 'react';
import * as monaco from 'monaco-editor-core';
import * as moonbitMode from "@moonbit/moonpad-monaco";
import { AppContext } from '../AppContext';
import { MoonBitTransformer } from '../utils/MoonBitTransformer.ts';

interface MoonBitCodeEditorProps {
  theme?: 'light' | 'dark';
}

// 初始化 MoonBit 模式
const moon = moonbitMode.init({
  onigWasmUrl: new URL("./onig.wasm", import.meta.url).toString(),
  lspWorker: new Worker("/lsp-server.js"),
  mooncWorkerFactory: () => new Worker("/moonc-worker.js"),
  codeLensFilter(l) {
    return l.command?.command === "moonbit-lsp/debug-main";
  },
});

const trace = moonbitMode.traceCommandFactory();

// 移除手动定义的语法规则，使用 TextMate 语法
// monaco.languages.register({ id: 'moonbit' });

// 设置编辑器主题
monaco.editor.defineTheme('moonbit-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '0000FF', fontStyle: 'bold' },
    { token: 'type', foreground: '008080' },
    { token: 'string', foreground: 'A31515' },
    { token: 'number', foreground: '098658' },
    { token: 'comment', foreground: '008000' },
  ],
  colors: {}
});

monaco.editor.defineTheme('moonbit-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '569CD6', fontStyle: 'bold' },
    { token: 'type', foreground: '4EC9B0' },
    { token: 'string', foreground: 'CE9178' },
    { token: 'number', foreground: 'B5CEA8' },
    { token: 'comment', foreground: '6A9955' },
  ],
  colors: {}
});

export const MoonBitCodeEditor: React.FC<MoonBitCodeEditorProps> = ({
  theme = 'light'
}) => {
  const { state, dispatch } = useContext(AppContext);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorInstance = useRef<monaco.editor.IStandaloneCodeEditor>();
  const modelRef = useRef<monaco.editor.ITextModel>();
  const compiler = state.compiler;

  state.moonbitCode = MoonBitTransformer({
    sourceFile: compiler.sourceFile,
    mode: state.options.treeMode,
  });

  useEffect(() => {
    monaco.editor.registerCommand("moonbit-lsp/debug-main", () => {
      run(true);
    });
  }, []);

  useEffect(() => {
    // 初始化 Monaco 环境
    self.MonacoEnvironment = {
      getWorkerUrl: function () {
        return "/editor.worker.js";
      },
    };

    // 创建编辑器模型
    modelRef.current = monaco.editor.createModel(
      state.moonbitCode,
      "moonbit",
      monaco.Uri.file("/main.mbt")
    );

    // 创建编辑器实例
    if (editorRef.current) {
      editorInstance.current = monaco.editor.create(editorRef.current, {
        model: modelRef.current,
        glyphMargin: false,
        minimap: { enabled: false },
        automaticLayout: true,
        folding: false,
        fontSize: 14,
        scrollBeyondLastLine: false,
        scrollbar: {
          alwaysConsumeMouseWheel: false,
        },
        fontFamily: "monospace",
        theme: theme === 'dark' ? 'moonbit-dark' : 'moonbit-light',
      });

      // 监听内容变化
      modelRef.current.onDidChangeContent(() => {
        const newValue = modelRef.current?.getValue();
        if (newValue !== state.moonbitCode) {
          dispatch({
            type: 'SET_MOONBIT_CODE',
            payload: newValue || ''
          });
        }
      });
    }

    // 清理函数
    return () => {
      modelRef.current?.dispose();
      editorInstance.current?.dispose();
    };
  }, []); // 仅在组件挂载时运行

  // 同步外部传入的 moonbitCode
  useEffect(() => {
    if (modelRef.current && modelRef.current.getValue() !== state.moonbitCode) {
      modelRef.current.setValue(state.moonbitCode);
    }
    debounce(() => run(false), 100)
  }, [state.moonbitCode]);

  async function run(debug: boolean) {
    if (debug) {
      const result = await moon.compile({
        libInputs: [["main.mbt", modelRef.current?.getValue() ?? '']],
        debugMain: true,
      });
      switch (result.kind) {
        case "success": {
          const js = result.js;
          const stream = await moon.run(js);
          let buffer = "";
          await stream.pipeTo(
            new WritableStream({
              write(chunk) {
                buffer += `${chunk}\n`;
              },
            }),
          );
          dispatch({
            type: 'SET_MOONBIT_OUTPUT',
            payload: buffer
          });
          return;
        }
        case "error": {
          console.error(result.diagnostics);
        }
      }
      return;
    }
    const stdout = await trace(monaco.Uri.file("/main.mbt").toString());
    if (stdout === undefined) return;
    console.log(stdout);
    dispatch({
      type: 'SET_MOONBIT_OUTPUT',
      payload: stdout
    });
  }

  return <div ref={editorRef} style={{ width: '100%', height: '100%' }} />;
};

// 辅助函数
function debounce<P extends any[], R>(f: (...args: P) => R, timeout: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: P) => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      f(...args);
      timer = null;
    }, timeout);
  };
}