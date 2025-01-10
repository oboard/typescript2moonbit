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

  // 用于跟踪已生成的类型别名
  const generatedTypeAliases = new Set<string>();
  let typeAliasDefinitions = '';

  // 在 interfaceTransformer 函数中添加一个计数器来跟踪重载方法
  const methodOverloadCounts = new Map<string, number>();

  // 辅助函数：生成函数类型的类型别名
  function generateFunctionTypeAlias(node: ts.FunctionTypeNode): string {
    const params = node.parameters.map((p) => typeTransformer(p.type)).join('_');
    const returnType = typeTransformer(node.type);
    const aliasName = `Fn${params ? '_' + params : ''}${returnType ? '_To_' + returnType : ''}`;

    if (generatedTypeAliases.has(aliasName)) {
      return aliasName;
    }

    generatedTypeAliases.add(aliasName);
    typeAliasDefinitions += `typealias ${aliasName} = (${node.parameters.map((p) => typeTransformer(p.type)).join(', ')}) -> ${typeTransformer(node.type)}

`;
    return aliasName;
  }

  // 辅助函数：格式化类型名称，将特殊字符转换为可读的形式
  function formatTypeName(typeName: string): string {
    // 先进行基本的格式转换
    const formatted = typeName
      .replace(/\[/g, 'Of')      // 将 [ 替换为 Of
      .replace(/\]/g, '')        // 移除 ]
      .replace(/,\s*/g, 'And')   // 将逗号替换为 And
      .replace(/[<>]/g, 'Of')    // 将 < 和 > 替换为 Of
      .replace(/\s+/g, '')       // 移除空格
      .replace(/[^\w]/g, '');    // 移除其他特殊字符

    // 确保首字母大写
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  function generateUnionEnum(types: ts.TypeNode[]): string {
    const typeNames = types.map(t => {
      if (t.kind === ts.SyntaxKind.FunctionType) {
        return generateFunctionTypeAlias(t as ts.FunctionTypeNode);
      }
      const baseType = typeTransformer(t);
      // 使用 formatTypeName 处理类型名称
      return formatTypeName(baseType);
    });

    const enumName = `${typeNames.join('Or')}`;

    if (generatedEnums.has(enumName)) {
      return enumName;
    }

    generatedEnums.add(enumName);
    const enumDef = `enum ${enumName} {
  ${types.map((t, i) => {
      const typeName = ts.isFunctionTypeNode(t)
        ? generateFunctionTypeAlias(t)
        : typeTransformer(t);
      return `${typeNames[i]}(${typeName})`;
    }).join('\n  ')}
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
    function formatParams(params: ts.NodeArray<ts.ParameterDeclaration>, typeParamsEnum: string = ''): {
      moonbitParams: string;  // MoonBit 函数声明的参数列表
      jsArgs: string;         // JavaScript 调用的参数列表
      jsParams: string;       // JavaScript 函数的参数列表
    } {
      const paramList = params.map(p => {
        let type = typeTransformer(p.type);
        // 如果参数类型涉及类型参数，使用枚举类型
        if (type.includes('K') && typeParamsEnum) {
          type = type.replace('K', typeParamsEnum);
        }
        return {
          name: p.name.getText(),
          type,
          optional: !!p.questionToken
        };
      });

      const moonbitParams = ['self: ' + _node.name.getText()]
        .concat(paramList.map(p => `${camelToSnakeCase(p.name)}: ${p.type}${p.optional ? '?' : ''}`))
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

    // 保留字列表
    const RESERVED_WORDS = new Set([
      'type',
      'fn',
      'let',
      'mut',
      'pub',
      'trait',
      'impl',
      'enum',
      'struct',
      'match',
      'if',
      'else',
      'while',
      'for',
      'in',
      'return',
      'break',
      'continue'
    ]);

    // 辅助函数：将驼峰命名转换为下划线格式，并处理保留字
    function camelToSnakeCase(name: string): string {
      // 如果是全大写，直接转小写
      if (name === name.toUpperCase()) {
        const lowercased = name.toLowerCase();
        return RESERVED_WORDS.has(lowercased) ? '_' + lowercased : lowercased;
      }

      const snakeCase = name
        // 处理连续的大写字母（如 'URL' 在 'myURL' 中）
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        // 在其他大写字母前添加下划线
        .replace(/([a-z\d])([A-Z])/g, '$1_$2')
        .replace(/^_/, '')  // 移除开头的下划线
        .toLowerCase();     // 转换为小写

      // 如果是保留字，添加下划线前缀
      return RESERVED_WORDS.has(snakeCase) ? '_' + snakeCase : snakeCase;
    }

    // 辅助函数：处理类型参数的约束
    function handleTypeParameter(typeParam: ts.TypeParameterDeclaration): string {
      const constraint = typeParam.constraint;
      if (!constraint) return '';

      if (ts.isTypeOperatorNode(constraint) && constraint.operator === ts.SyntaxKind.KeyOfKeyword) {
        const typeRef = constraint.type;
        if (ts.isTypeReferenceNode(typeRef)) {
          const symbol = compiler.bindingTools().typeChecker.getSymbolAtLocation(typeRef.typeName);
          if (!symbol || !symbol.declarations) return '';

          const declaration = symbol.declarations[0];
          if (ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration)) {
            const type = compiler.bindingTools().typeChecker.getTypeAtLocation(declaration);
            const properties = compiler.bindingTools().typeChecker.getPropertiesOfType(type);

            // 生成枚举名称，首字母大写
            const enumName = `${typeRef.typeName.getText()}Keys`;
            const capitalizedEnumName = enumName.charAt(0).toUpperCase() + enumName.slice(1);

            if (!generatedEnums.has(capitalizedEnumName)) {
              generatedEnums.add(capitalizedEnumName);
              enumDefinitions += `enum ${capitalizedEnumName} {
  ${properties.map(prop => `${formatTypeName(prop.name)}`).join('\n  ')}
}

`;
            }
            return capitalizedEnumName; // 返回首字母大写的枚举名
          }
        }
      }
      return typeTransformer(constraint);
    }

    // 辅助函数：生成方法的 extern 函数定义
    function generateMethodExtern(method: ts.MethodSignature, structName: string): string {
      let typeParamsEnum = '';
      if (method.typeParameters) {
        method.typeParameters.forEach(typeParam => {
          const enumType = handleTypeParameter(typeParam);
          if (enumType) {
            typeParamsEnum = enumType;
          }
        });
      }

      const params = formatParams(method.parameters, typeParamsEnum);
      let methodName = camelToSnakeCase(cleanPropertyName(method.name.getText()));

      // 处理方法重载
      const baseMethodName = methodName;
      if (!methodOverloadCounts.has(baseMethodName)) {
        methodOverloadCounts.set(baseMethodName, 0);
      } else {
        // 如果是重载方法，增加计数并在方法名后添加数字
        const count = methodOverloadCounts.get(baseMethodName)! + 1;
        methodOverloadCounts.set(baseMethodName, count);
        // 从第二个重载开始添加数字后缀
        if (count > 0) {
          methodName = `${methodName}${count + 1}`;
        }
      }

      // 在 extern 函数名中使用小写的枚举名
      const enumSuffix = '';

      return `extern "js" fn ${structName}::${methodName}${enumSuffix}(${params.moonbitParams}) -> ${typeTransformer(method.type)} =
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

    // 处理索引签名
    function handleIndexSignature(member: ts.IndexSignatureDeclaration, structName: string): string {
      const paramType = typeTransformer(member.parameters[0].type);
      const returnType = typeTransformer(member.type);

      // 根据参数类型生成适当的运算符重载
      if (paramType === 'Double') { // number类型的索引签名
        return `fn op_get(self: ${structName}, index: Int) -> ${returnType} =
#|index => self[index]

fn op_set(self: ${structName}, index: Int, value: ${returnType}) -> Unit =
#|(index, value) => { self[index] = value }

`;
      }
      return '';
    }

    // 在收集成员时处理索引签名
    let indexSignatureMethods = '';
    _node.members.forEach(member => {
      if (ts.isIndexSignatureDeclaration(member)) {
        indexSignatureMethods += handleIndexSignature(member, _node.name.getText());
      } else if (ts.isPropertySignature(member)) {
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
            // 使用 cleanPropertyName 处理属性名
            const propName = cleanPropertyName(m.name.getText());
            return camelToSnakeCase(propName) + ': ' + typeTransformer(m.type);
          }
          return '';
        })
        .filter(Boolean)
        .join('\n  ')
      }
}

extern "js" fn ${structName}::new() -> ${structName} =
#|() => new ${structName}()

${indexSignatureMethods}${functions}`;

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
          case ts.SyntaxKind.AnyKeyword:
            return `String`
          // case ts.SyntaxKind.TemplateLiteralType:
          //   return `String`
          // case ts.SyntaxKind.StringLiteral:
          //   return `String`
          default:
            return `Json`
        }
      }
      case ts.SyntaxKind.ParenthesizedType: {
        const _node = (node as ts.ParenthesizedTypeNode);
        return `(${typeTransformer(_node.type)})`
      }
      case ts.SyntaxKind.TemplateLiteralType: {
        const _node = node as ts.TemplateLiteralTypeNode;
        // 获取模板字面量的名称，通常是类型别名的名称
        const typeName = node.parent && ts.isTypeAliasDeclaration(node.parent) ?
          node.parent.name.getText() :
          'TemplateLiteral';

        // 首字母大写
        const capitalizedTypeName = typeName.charAt(0).toUpperCase() + typeName.slice(1);

        // 生成枚举
        if (!generatedEnums.has(capitalizedTypeName)) {
          generatedEnums.add(capitalizedTypeName);
          enumDefinitions += `enum ${capitalizedTypeName} {
    String(String)
  }

`;
        }
        return capitalizedTypeName;
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

  // 在 interfaceTransformer 函数中添加一个辅助函数来处理属性名
  function cleanPropertyName(name: string): string {
    return name
      // 移除属性名中的单引号和双引号
      .replace(/['"]/g, '')
      // 将减号转换为 _minus_
      .replace(/-/g, '_minus_')
      // 将加号转换为 _plus_
      .replace(/\+/g, '_plus_')
      // 将星号转换为 _star_
      .replace(/\*/g, '_star_')
      // 将斜杠转换为 _slash_
      .replace(/\//g, '_slash_')
      // 将点号转换为 _dot_
      .replace(/\./g, '_dot_')
      // 将问号转换为 _question_
      .replace(/\?/g, '_question_')
      // 将感叹号转换为 _exclamation_
      .replace(/!/g, '_exclamation_')
      // 将@符号转换为 _at_
      .replace(/@/g, '_at_')
      // 将#符号转换为 _hash_
      .replace(/#/g, '_hash_')
      // 将$符号转换为 _dollar_
      .replace(/\$/g, '_dollar_')
      // 将%符号转换为 _percent_
      .replace(/%/g, '_percent_')
      // 将^符号转换为 _caret_
      .replace(/\^/g, '_caret_')
      // 将&符号转换为 _and_
      .replace(/&/g, '_and_')
      // 将空格转换为下划线
      .replace(/\s+/g, '_')
      // 移除其他任何特殊字符
      .replace(/[^\w_]/g, '');
  }

  // 修改返回值，包含生成的类型别名和枚举定义
  const mainCode = renderNode(sourceFile);
  return typeAliasDefinitions + enumDefinitions + mainCode;
}
