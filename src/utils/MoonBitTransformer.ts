import { getChildrenFunction, type Node, type SourceFile } from "../compiler/index.ts";
import type { CompilerState, TreeMode } from "../types/index.ts";
import * as ts from "typescript";

export interface MoonBitProps {
  sourceFile: SourceFile;
  mode: TreeMode;
  compiler: CompilerState;
}

export function MoonBitTransformer(props: MoonBitProps): string {
  const { sourceFile, mode, compiler } = props;
  const getChildren = getChildrenFunction(mode, sourceFile);
  const generatedEnums = new Set<string>(); // 用于跟踪已生成的枚举
  let enumDefinitions = ''; // 存储生成的枚举定义

  function generateUnionEnum(types: ts.TypeNode[]): string {
    const typeNames = types.map(t => {
      const baseType = typeTransformer(t);
      return baseType.charAt(0).toUpperCase() + baseType.slice(1);
    });

    const enumName = `${typeNames.join('Or')}`;

    // 如果这个枚举已经生成过，直接返回名称
    if (generatedEnums.has(enumName)) {
      return enumName;
    }

    // 生成新的枚举定义
    generatedEnums.add(enumName);
    const enumDef = `enum ${enumName} {
  ${types.map((t, i) => `${typeNames[i]}(${typeTransformer(t)})`).join('\n  ')}
}
`;
    enumDefinitions += enumDef;
    return enumName;
  }

  function renderNode(node: Node): string {
    const children = getChildren(node);
    const codeTransformer = getCodeTransformer(node.kind)(node);
    if (children.length === 0) {
      return codeTransformer;
    } else {
      return codeTransformer + children.map((n) => renderNode(n)).join('');
    }
  }

  function getCodeTransformer(kind: ts.SyntaxKind) {
    switch (kind) {
      case ts.SyntaxKind.TypeAliasDeclaration:
        return typealiasTransformer;
      case ts.SyntaxKind.InterfaceDeclaration:
        return interfaceTransformer;
      default:
        return () => "";
    }
  }

  function typealiasTransformer(node: Node) {
    const _node = node as ts.TypeAliasDeclaration;
    const hasExport = _node.modifiers?.some((m) => m.kind == ts.SyntaxKind.ExportKeyword) || false;
    if (_node.name.getSourceFile() == undefined) {
      return '';
    }
    let alias = _node.name.getText()
    // alias首字母大写
    alias = alias.charAt(0).toUpperCase() + alias.slice(1)
    return `${hasExport ? 'pub(all) ' : ''}typealias ${alias} = ${typeTransformer(_node.type)}\n`;
  }

  function interfaceTransformer(node: Node) {
    const _node = node as ts.InterfaceDeclaration;
    const hasExport = _node.modifiers?.some((m) => m.kind == ts.SyntaxKind.ExportKeyword) || false;
    if (_node.name.getSourceFile() == undefined) {
      return '';
    }

    let allMembers = new Map<string, ts.TypeElement>();
    let functions = '';

    // 辅助函数：格式化参数列表
    function formatParams(params: ts.NodeArray<ts.ParameterDeclaration>): {
      moonbitParams: string;  // MoonBit 函数声明的参数列表
      jsArgs: string;         // JavaScript 调用的参数列表
      jsParams: string;       // JavaScript 函数的参数列表
    } {
      const paramList = params.map(p => ({
        name: p.name.getText(),
        type: typeTransformer(p.type),
        optional: !!p.questionToken
      }));

      const moonbitParams = ['self: ' + _node.name.getText()]
        .concat(paramList.map(p => `${p.name}: ${p.type}${p.optional ? '?' : ''}`))
        .join(', ');

      const jsParams = ['self']
        .concat(paramList.map(p => p.name))
        .join(params.length > 0 ? ', ' : '');

      const jsArgs = paramList.map(p => p.name).join(', ');

      return {
        moonbitParams,
        jsParams,
        jsArgs
      };
    }

    // 辅助函数：将驼峰命名转换为下划线格式
    function camelToSnakeCase(name: string): string {
      return name
        .replace(/([A-Z])/g, '_$1')     // 在大写字母前添加下划线
        .replace(/^_/, '')               // 移除开头的下划线
        .toLowerCase();                  // 转换为小写
    }

    // 辅助函数：生成方法的 extern 函数定义
    function generateMethodExtern(method: ts.MethodSignature, structName: string): string {
      const params = formatParams(method.parameters);
      const methodName = camelToSnakeCase(method.name.getText());
      return `extern "js" fn ${structName}::${methodName}(${params.moonbitParams}) -> ${typeTransformer(method.type)} =
#|(${params.jsParams}) => self.${method.name.getText()}(${params.jsArgs})
`;
    }

    // 处理继承
    if (_node.heritageClauses) {
      for (const heritage of _node.heritageClauses) {
        if (heritage.token === ts.SyntaxKind.ExtendsKeyword) {
          for (const type of heritage.types) {
            const symbol = compiler.bindingTools().typeChecker.getSymbolAtLocation(type.expression);
            if (!symbol || !symbol.declarations) continue;

            const baseDeclaration = symbol.declarations[0];
            if (!ts.isInterfaceDeclaration(baseDeclaration)) continue;

            // 收集基类的所有成员
            baseDeclaration.members.forEach(member => {
              if (ts.isPropertySignature(member)) {
                allMembers.set(member.name.getText(), member);
              } else if (ts.isMethodSignature(member)) {
                // 收集方法并生成 extern 函数
                allMembers.set(member.name.getText(), member);
                functions += generateMethodExtern(member, _node.name.getText());
              }
            });
          }
        }
      }
    }

    // 收集当前接口的成员
    _node.members.forEach(member => {
      if (ts.isPropertySignature(member)) {
        allMembers.set(member.name.getText(), member);
      } else if (ts.isMethodSignature(member)) {
        allMembers.set(member.name.getText(), member);
        functions += generateMethodExtern(member, _node.name.getText());
      }
    });

    // 生成 struct
    const structName = _node.name.getText();
    const structDef = `${hasExport ? 'pub(all) ' : ''}struct ${structName} {
  ${Array.from(allMembers.values())
        .map((m) => {
          if (ts.isPropertySignature(m)) {
            return camelToSnakeCase(m.name.getText()) + ': ' + typeTransformer(m.type)
          }
          return '';
        })
        .filter(Boolean)
        .join('\n  ')
      }
}

extern "js" fn ${structName}::new() -> ${structName} =
#|() => new ${structName}()

${functions}`;

    return structDef;
  }

  function typeTransformer(node: ts.TypeNode | undefined): string {
    if (!node) return '';
    switch (node.kind) {
      case ts.SyntaxKind.BooleanKeyword:
        return 'Bool'
      case ts.SyntaxKind.NumberKeyword:
        return 'Double'
      case ts.SyntaxKind.StringKeyword:
        return 'String'
      case ts.SyntaxKind.UndefinedKeyword:
      case ts.SyntaxKind.NullKeyword:
        return 'Json'
      case ts.SyntaxKind.JSDocNullableType:
        return typeTransformer((node as ts.JSDocNullableType).type) + '?'
      case ts.SyntaxKind.Unknown:
        return 'Json'
      case ts.SyntaxKind.UnionType: {
        const _node = (node as ts.UnionTypeNode);
        // 先合并重复的类型
        const uniqueTypes = new Set(_node.types.map((t) => {
          if (t.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword)) {
            return "Undefined";
          }
          return typeTransformer(t);
        }));
        // 如果只有两个类型，并且其中一个是undefined，处理为可选类型
        if (uniqueTypes.size == 2 && uniqueTypes.has("Undefined")) {
          const nonUndefinedType = Array.from(uniqueTypes).find(t => t !== "Undefined");
          return nonUndefinedType! + '?';
        }
        // 其他情况生成联合类型枚举
        return generateUnionEnum(Array.from(_node.types));
      }
      case ts.SyntaxKind.VoidKeyword:
        return 'Unit'
      case ts.SyntaxKind.FunctionType: {
        const _node = (node as ts.FunctionTypeNode);
        return `(${_node.parameters.map((p) => typeTransformer(p.type)).join(', ')}) -> ${typeTransformer(_node.type)}`
      }
      case ts.SyntaxKind.IndexedAccessType: {
        const _node = (node as ts.IndexedAccessTypeNode);
        return `${typeTransformer(_node.objectType)}[${typeTransformer(_node.indexType)}]`
      }
      case ts.SyntaxKind.TypeReference: {
        const _node = (node as ts.TypeReferenceNode);
        return _node.typeName.getText() + (_node.typeArguments?.length ?? 0 > 0 ? `[${_node.typeArguments?.map((t) => typeTransformer(t)).join(', ')}]` : '');
      }
      case ts.SyntaxKind.ArrayType: {
        const _node = (node as ts.ArrayTypeNode);
        return `Array[${typeTransformer(_node.elementType)}]`
      }
      case ts.SyntaxKind.LiteralType: {
        const _node = (node as ts.LiteralTypeNode);
        switch (_node.literal.kind) {
          case ts.SyntaxKind.StringLiteral:
            return `String`
          case ts.SyntaxKind.NumericLiteral:
            return `Double`
          case ts.SyntaxKind.TrueKeyword:
            return `Bool`
          case ts.SyntaxKind.FalseKeyword:
            return `Bool`
          default:
            return `Json`
        }
      }
      case ts.SyntaxKind.ParenthesizedType: {
        const _node = (node as ts.ParenthesizedTypeNode);
        return `(${typeTransformer(_node.type)})`
      }
      default: {
        if (node.getSourceFile() == undefined) {
          return '';
        }
        let typeName = node.getText();
        // 首字母大写
        typeName = typeName.charAt(0).toUpperCase() + typeName.slice(1)
        return typeName;
      }
    }
  }

  // 修改返回值，包含生成的枚举定义
  const mainCode = renderNode(sourceFile);
  return enumDefinitions + mainCode;
}
