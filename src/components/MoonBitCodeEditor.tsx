import React, { useEffect, useRef, useContext } from 'react';
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
        lineNumbers: "off",
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
        theme: theme === 'dark' ? 'dark-plus' : 'light-plus',
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
  }, [state.moonbitCode]);

  // 主题更新
  useEffect(() => {
    monaco.editor.setTheme(theme === 'dark' ? 'dark-plus' : 'light-plus');
  }, [theme]);

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
          output.textContent = buffer;
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
    output.textContent = stdout;
  }

  monaco.editor.registerCommand("moonbit-lsp/debug-main", () => {
    run(true);
  });

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