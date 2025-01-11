// 枚举生成相关的函数
import * as ts from "typescript";
import { formatTypeName } from "./formatters";
import { typeTransformer } from "./typeTransformers";
import { generateFunctionTypeAlias } from "./functionTypeGenerator";
import { GeneratorState } from "./types";


export function generateUnionEnum(types: ts.TypeNode[], state: GeneratorState): string {
    // 使用 Map 来去重，键是类型的字符串表示，值是对应的类型节点
    const uniqueTypes = new Map<string, ts.TypeNode>();
    
    types.forEach(t => {
        const typeStr = ts.isFunctionTypeNode(t) ? 
            generateFunctionTypeAlias(t as ts.FunctionTypeNode, state) :
            typeTransformer(t, state);
        uniqueTypes.set(typeStr, t);
    });

    const typeNames = Array.from(uniqueTypes.values()).map(t => {
        if (t.kind === ts.SyntaxKind.FunctionType) {
            return generateFunctionTypeAlias(t as ts.FunctionTypeNode, state);
        }
        const baseType = typeTransformer(t, state);
        return formatTypeName(baseType);
    });

    const enumName = `${typeNames.join('Or')}`;
    if (state.generatedEnums.has(enumName)) {
        return enumName;
    }

    state.generatedEnums.add(enumName);
    const enumDef = `enum ${enumName} {
  ${Array.from(uniqueTypes.values()).map((t, i) => {
        const typeName = ts.isFunctionTypeNode(t)
            ? generateFunctionTypeAlias(t, state)
            : typeTransformer(t, state);
        return `${typeNames[i]}${typeNames[i].startsWith('String_') ? '' : `(${typeName})`}`;
    }).join('\n  ')}
}
`;
    state.enumDefinitions += enumDef;
    return enumName;
}