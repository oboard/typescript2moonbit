// 类型转换相关的函数
import * as ts from "typescript";
import { generateUnionEnum } from "./enumGenerator";
import { GeneratorState } from "./types";
import { camelToSnakeCase } from "./formatters";

export function typeTransformer(node: ts.TypeNode | undefined, state: GeneratorState): string {
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
            return typeTransformer((node as ts.JSDocNullableType).type, state) + '?'
        case ts.SyntaxKind.Unknown:
            return 'Json'
        case ts.SyntaxKind.UnionType: {
            const _node = (node as ts.UnionTypeNode);
            // 先合并重复的类型
            const uniqueTypes = new Set(_node.types.map((t) => {
                if (t.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword)) {
                    return "Undefined";
                }
                return typeTransformer(t, state);
            }));
            // 如果只有两个类型，并且其中一个是undefined，处理为可选类型
            if (uniqueTypes.size == 2 && uniqueTypes.has("Undefined")) {
                const nonUndefinedType = Array.from(uniqueTypes).find(t => t !== "Undefined");
                return nonUndefinedType! + '?';
            }
            // 其他情况生成联合类型枚举
            return generateUnionEnum(Array.from(_node.types), state);
        }
        case ts.SyntaxKind.VoidKeyword:
            return 'Unit'
        case ts.SyntaxKind.FunctionType: {
            const _node = (node as ts.FunctionTypeNode);
            return `(${_node.parameters.map((p) => typeTransformer(p.type, state)).join(', ')}) -> ${typeTransformer(_node.type, state)}`
        }
        case ts.SyntaxKind.IndexedAccessType: {
            const _node = (node as ts.IndexedAccessTypeNode);
            return `${typeTransformer(_node.objectType, state)}[${typeTransformer(_node.indexType, state)}]`
        }
        case ts.SyntaxKind.TypeReference: {
            const _node = (node as ts.TypeReferenceNode);
            // 处理 Record 类型
            if (_node.typeName.getText() === 'Record' && _node.typeArguments?.length === 2) {
                const [keyType, valueType] = _node.typeArguments;
                return `Map[${typeTransformer(keyType, state)}, ${typeTransformer(valueType, state)}]`;
            }
            return _node.typeName.getText() + (_node.typeArguments?.length ?? 0 > 0 ? 
                `[${_node.typeArguments?.map((t) => typeTransformer(t, state)).join(', ')}]` : '');
        }
        case ts.SyntaxKind.ArrayType: {
            const _node = (node as ts.ArrayTypeNode);
            return `Array[${typeTransformer(_node.elementType, state)}]`
        }
        case ts.SyntaxKind.AnyKeyword:
            return `String`
        case ts.SyntaxKind.TypeLiteral: {
            // const _node = (node as ts.TypeLiteralNode);
            return `Json`
        }
        case ts.SyntaxKind.LiteralType: {
            const _node = (node as ts.LiteralTypeNode);
            switch (_node.literal.kind) {

                case ts.SyntaxKind.StringLiteral:
                    return 'String_' + camelToSnakeCase(_node.literal.text)
                // return `String`
                case ts.SyntaxKind.NumericLiteral:
                    return `Double`
                case ts.SyntaxKind.BooleanKeyword:
                    return `Bool`
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
            return `(${typeTransformer(_node.type, state)})`
        }
        case ts.SyntaxKind.TemplateLiteralType: {
            // 获取模板字面量的名称，通常是类型别名的名称
            const typeName = node.parent && ts.isTypeAliasDeclaration(node.parent) ?
                node.parent.name.getText() :
                'TemplateLiteral';

            // 首字母大写
            const capitalizedTypeName = typeName.charAt(0).toUpperCase() + typeName.slice(1);

            // 生成枚举
            if (!state.generatedEnums.has(capitalizedTypeName)) {
                state.generatedEnums.add(capitalizedTypeName);
                state.enumDefinitions += `enum ${capitalizedTypeName} {
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
