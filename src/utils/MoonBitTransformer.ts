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
    let alias = children[children.length - 1].getText()
    // alias首字母大写
    alias = alias.charAt(0).toUpperCase() + alias.slice(1)
    const type = children[children.length - 2].getText()
    return `${hasExport ? 'pub ' : ''}typealias ${alias} = ${type}\n`;
  }

  function interfaceTransformer(node: Node) {
    const _node = node as ts.InterfaceDeclaration;
    const hasExport = _node.modifiers?.some((m) => m.kind == ts.SyntaxKind.ExportKeyword) || false;
    return `${hasExport ? 'pub ' : ''}struct ${_node.name.getText()} {
  ${_node.members
        .map((m) => m as ts.PropertySignature)
        .map((m) => m.name.getText() + ': ' + m.type?.getText() ?? '')
        .join('\n  ')
      }
}
`;

  }
}
