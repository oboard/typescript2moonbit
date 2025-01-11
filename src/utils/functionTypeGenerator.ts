// 函数类型生成相关的函数
import * as ts from "typescript";
import { typeTransformer } from "./typeTransformers";
import { GeneratorState } from "./types";


// 辅助函数：生成函数类型的类型别名
export function generateFunctionTypeAlias(
    node: ts.FunctionTypeNode,
    state: GeneratorState
): string {
    const params = node.parameters.map((p) => typeTransformer(p.type, state)).join('_');
    const returnType = typeTransformer(node.type, state);
    const aliasName = `Fn${params ? '_' + params : ''}${returnType ? '_To_' + returnType : ''}`;

    if (state.generatedTypeAliases.has(aliasName)) {
        return aliasName;
    }

    state.generatedTypeAliases.add(aliasName);
    state.typeAliasDefinitions += `typealias ${aliasName} = (${node.parameters.map((p) => typeTransformer(p.type, state)).join(', ')}) -> ${typeTransformer(node.type, state)}

`;
    return aliasName;
}