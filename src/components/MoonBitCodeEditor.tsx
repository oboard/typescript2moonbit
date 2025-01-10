import { useEffect, useRef, useContext } from 'react';
import * as monaco from 'monaco-editor-core';
import * as moonbitMode from "@moonbit/moonpad-monaco";
import { AppContext } from '../AppContext';
import { MoonBitTransformer } from '../utils/MoonBitTransformer';

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

// 注册 MoonBit 语言
monaco.languages.register({ id: 'moonbit' });

// 定义 MoonBit 语言的语法规则
monaco.languages.setMonarchTokensProvider('moonbit', {
  defaultToken: '',
  tokenPostfix: '.moonbit',

  // 控制关键字
  keywords: [
    'guard', 'if', 'while', 'break', 'continue', 'return', 
    'try', 'catch', 'except', 'raise', 'match', 'else', 
    'as', 'in', 'loop', 'for'
  ],

  // 声明关键字
  declarations: [
    'type', 'typealias', 'let', 'const', 'enum', 'struct',
    'import', 'trait', 'derive', 'test', 'impl', 'with'
  ],

  // 修饰符
  modifiers: ['mut', 'pub', 'priv', 'readonly', 'extern'],

  // 支持的类型类
  typeClasses: ['Eq', 'Compare', 'Hash', 'Show', 'Default', 'ToJson', 'FromJson'],

  // 运算符
  operators: [
    '->', '=>', '=', '|>', '===', '==', '!=', '>=', '<=', 
    '>', '<', '&&', '||', '|', '&', '^', '<<', '>>', '+', 
    '-', '*', '%', '/'
  ],

  // 符号定义
  symbols: /[=><!~?:&|+\-*\/\^%]+/,

  // 转义字符
  escapes: /\\(?:[0\\tnrb"']|x[0-9A-Fa-f]{2}|o[0-3][0-7]{2}|u[0-9A-Fa-f]{4}|u\{[0-9A-Fa-f]*\})/,

  // 词法分析器规则
  tokenizer: {
    root: [
      // 注释
      [/\/\/\/.*$/, 'comment.doc'],
      [/\/\/[^/].*$/, 'comment'],
      [/\/\*/, 'comment', '@comment'],

      // 字符串
      [/'[^'\\]'/, 'string'],
      [/"([^"\\]|\\.)*$/, 'string.invalid'],
      [/"/, 'string', '@string'],
      [/#\|.*/, 'string'],
      [/\$\|.*/, 'string'],

      // 数字
      [/\b\d[\d_]*(?!\.)U?L?\b/, 'number'],
      [/\b\d[\d_]*\.[\d_]+([Ee][+-]?\d[\d_]+)?\b/, 'number.float'],
      [/\b0[XxOoBb][\dA-Fa-f_]+U?L?\b/, 'number.hex'],

      // 类型名（大写字母开头）
      [/\b[A-Z][A-Za-z0-9_]*\??/, 'type'],

      // 函数定义和调用
      [/\b(fn)\b\s*([A-Z][A-Za-z0-9_]*::)?([a-z0-9_][A-Za-z0-9_]*)?/, [
        'keyword',
        'type',
        'function'
      ]],
      [/[a-z0-9_][A-Za-z0-9_]*[!?]?\s*\(/, 'function'],

      // 模块名
      [/@[A-Za-z][A-Za-z0-9_/]*/, 'namespace'],

      // 关键字和标识符
      [/\b(self)\b/, 'variable.language'],
      [/\b(true|false|\(\))\b/, 'constant.language'],
      [/\b[a-z_][a-zA-Z0-9_]*\b/, {
        cases: {
          '@keywords': 'keyword.control',
          '@declarations': 'keyword',
          '@modifiers': 'storage.modifier',
          '@typeClasses': 'support.class',
          '@default': 'variable'
        }
      }],

      // 运算符和分隔符
      [/@symbols/, {
        cases: {
          '@operators': 'operator',
          '@default': ''
        }
      }],
      [/[{}()\[\]]/, '@brackets'],
    ],

    comment: [
      [/[^/*]+/, 'comment'],
      [/\/\*/, 'comment', '@push'],
      [/\*\//, 'comment', '@pop'],
      [/[/*]/, 'comment']
    ],

    string: [
      [/[^\\"]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/\\\{/, { token: 'string.quote', next: '@interpolated' }],
      [/"/, 'string', '@pop']
    ],

    interpolated: [
      [/\}/, { token: 'string.quote', next: '@string' }],
      { include: 'root' }
    ]
  }
});

// 配置语言特性
monaco.languages.setLanguageConfiguration('moonbit', {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/']
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')']
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
  ]
});

// 设置编辑器主题
monaco.editor.defineTheme('moonbit-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '0000FF' },
    { token: 'keyword.control', foreground: '0000FF' },
    { token: 'storage.modifier', foreground: '0000FF' },
    { token: 'type', foreground: '267f99' },
    { token: 'support.class', foreground: '267f99' },
    { token: 'string', foreground: 'a31515' },
    { token: 'string.escape', foreground: 'e3116c' },
    { token: 'comment', foreground: '008000' },
    { token: 'comment.doc', foreground: '008000', fontStyle: 'italic' },
    { token: 'number', foreground: '098658' },
    { token: 'number.hex', foreground: '098658' },
    { token: 'number.float', foreground: '098658' },
    { token: 'constant.language', foreground: '0000ff' },
    { token: 'function', foreground: '795E26' },
    { token: 'variable', foreground: '001080' },
    { token: 'variable.language', foreground: '0000ff' },
    { token: 'operator', foreground: '000000' },
    { token: 'namespace', foreground: '267f99' },
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
    compiler: state.compiler,
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
        language: 'moonbit',
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