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
    return `${hasExport ? 'pub(all) ' : ''}struct ${_node.name.getText()} {
  ${_node.members
        .map((m) => m as ts.PropertySignature)
        .map((m) => m.name.getText() + ': ' + typeTransformer(m.type))
        .join('\n  ')
      }
}
`;

  }

  function typeTransformer(node: ts.TypeNode | undefined): string {
    if (!node) return '';
    switch (node.kind) {
      case ts.SyntaxKind.BooleanKeyword:
        return 'Bool'
      case ts.SyntaxKind.NumberKeyword:
        return 'Int'
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
        // 如果只有两个，并且其中一个是undefined
        const _node = (node as ts.UnionTypeNode);
        if (_node.types.length == 2 && _node.types[1].getText() == 'undefined') {
          return typeTransformer(_node.types[0]) + '?'
        }
        return 'Json'
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
}
