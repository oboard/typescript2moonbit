import { getChildrenFunction, type Node, type SourceFile } from "../compiler/index.ts";
import type { TreeMode } from "../types/index.ts";
import * as ts from "typescript";

export interface MoonBitProps {
  sourceFile: SourceFile;
  mode: TreeMode;
}

export function MoonBitTransformer(props: MoonBitProps): string {
  const { sourceFile, mode } = props;
  return renderNode(sourceFile, getChildrenFunction(mode, sourceFile));

  function renderNode(node: Node, getChildren: (node: Node) => readonly Node[]): JSX.Element {
    const children = getChildren(node);
    const codeTransformer = getCodeTransformer(node)(getChildren(node));
    if (children.length === 0) {
      return codeTransformer;
    } else {
      return codeTransformer + children.map((n) => renderNode(n, getChildren)).join('');
    }
  }

  function getCodeTransformer(node: Node) {
    switch (node.kind) {
      case ts.SyntaxKind.TypeAliasDeclaration:
        return typealiasTransformer;
      default:
        return () => "";
    }
  }

  function typealiasTransformer(children: readonly Node[]) {
    const [_keyword, identifier, type] = children;
    if (type == undefined) return "";
    console.log(type, identifier);
    if (type.getSourceFile() == undefined) return "";
    return `typealias TYPE_${type.getText()} = ${identifier.getText()}\n`;
  }
}
