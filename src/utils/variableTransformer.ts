import * as ts from "typescript";
import { CompilerState } from "../types";
import { GeneratorState } from "./types";
import { typeTransformer } from "./typeTransformers";

export function variableTransformer(node: ts.VariableStatement, compiler: CompilerState, state: GeneratorState): string {
    return `${node.declarationList.declarations.map((d) => {
        if (d.name.getSourceFile() == null) return '';
        return '';
    }).join('\n  ')}`;
}
