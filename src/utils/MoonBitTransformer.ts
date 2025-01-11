import { getChildrenFunction, type Node, type SourceFile } from "../compiler/index.ts";
import type { CompilerState, TreeMode } from "../types/index.ts";
import * as ts from "typescript";
import { interfaceTransformer } from "./interfaceTransformer";
import { typeTransformer } from "./typeTransformers";
import { GeneratorState } from "./types.ts";
import { variableTransformer } from "./variableTransformer.ts";

export interface MoonBitProps {
  sourceFile: SourceFile;
  mode: TreeMode;
  compiler: CompilerState;
}

export function MoonBitTransformer(props: MoonBitProps): string {
  const { sourceFile, mode, compiler } = props;
  const getChildren = getChildrenFunction(mode, sourceFile);
  const generatedEnums = new Set<string>();
  const generatedTypeAliases = new Set<string>();
  const state: GeneratorState = {
    generatedEnums,
    enumDefinitions: '',
    generatedTypeAliases,
    typeAliasDefinitions: ''
  };

  function renderNode(node: Node, state: GeneratorState): string {
    const children = getChildren(node);
    const codeTransformer = getCodeTransformer(node.kind, state)(node);
    if (children.length === 0) {
      return codeTransformer;
    } else {
      return codeTransformer + children.map((n) => renderNode(n, state)).join('');
    }
  }

  function getCodeTransformer(kind: ts.SyntaxKind, state: GeneratorState) {
    switch (kind) {
      case ts.SyntaxKind.TypeAliasDeclaration:
        return typealiasTransformer;
      case ts.SyntaxKind.InterfaceDeclaration:
        return (node: Node) => interfaceTransformer(
          node as ts.InterfaceDeclaration,
          compiler, state
        );
      case ts.SyntaxKind.VariableStatement:
        return (node: Node) => variableTransformer(
          node as ts.VariableStatement,
          compiler, state
        );
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
    return `${hasExport ? 'pub(all) ' : ''}typealias ${alias} = ${typeTransformer(_node.type, state)}\n`;
  }

  const mainCode = renderNode(sourceFile, state);
  return state.typeAliasDefinitions + state.enumDefinitions + mainCode;
}
