import { getChildrenFunction, type Node, type SourceFile } from "../compiler/index.ts";
import type { TreeMode } from "../types/index.ts";
import * as ts from "typescript";

export interface MoonBitProps {
  sourceFile: SourceFile;
  mode: TreeMode;
}

export function MoonBitTransformer(props: MoonBitProps): string {
  const { sourceFile, mode } = props;
  const getChildren = getChildrenFunction(mode, sourceFile);
  return renderNode(sourceFile);

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
    const children = getChildren(node);
    if (children.length < 2) return "";
    const hasExport = children.length > 1 ? children[0].kind == ts.SyntaxKind.ExportKeyword : false
    const alias = children[children.length - 1].getText()
    const type = children[children.length - 2].getText()
    return `${hasExport ? 'pub ' : ''}typealias TYPE_${alias} = ${type}\n`;
  }

  function interfaceTransformer(node: Node) {
    const children = getChildren(node);
    const _node = node.members;
    console.log(_node)
    if (children.length < 2) return "";
    const hasExport = children.length > 1 ? children[0].kind == ts.SyntaxKind.ExportKeyword : false
    return `${hasExport ? 'pub ' : ''}fn Interface_${0}\n`;
  }
}
