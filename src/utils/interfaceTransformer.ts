// 接口转换相关的函数
import * as ts from "typescript";
import { camelToSnakeCase, cleanPropertyName, formatTypeName } from "./formatters";
import { typeTransformer } from "./typeTransformers";
import { CompilerState } from "../types/index";
import { GeneratorState } from "./types";

export function interfaceTransformer(
    node: ts.InterfaceDeclaration,
    compiler: CompilerState,
    state: GeneratorState
): string {
    const methodOverloadCounts = new Map<string, number>();
    const hasExport = node.modifiers?.some((m) => m.kind == ts.SyntaxKind.ExportKeyword) || false;
    if (node.name.getSourceFile() == undefined) {
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
            let type = typeTransformer(p.type, state);
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

        const moonbitParams = ['self: ' + node.name.getText()]
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
    // 辅助函数：生成方法的 extern 函数定义
    function generateMethodExtern(method: ts.MethodSignature, structName: string): string {
        let typeParamsEnum = '';
        if (method.typeParameters) {
            method.typeParameters.forEach(typeParam => {
                const enumType = handleTypeParameter(typeParam, compiler, state);
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

        return `extern "js" fn ${structName}::${methodName}${enumSuffix}(${params.moonbitParams}) -> ${typeTransformer(method.type, state)} =
#|(${params.jsParams}) => self.${method.name.getText()}(${params.jsArgs})
`;
    }

    // 处理继承
    if (node.heritageClauses) {
        for (const heritage of node.heritageClauses) {
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
                            functions += generateMethodExtern(member, node.name.getText());
                        }
                    });
                }
            }
        }
    }

    if (node.typeParameters) {
        node.typeParameters.forEach(typeParam => {
            console.log(handleTypeParameter(typeParam, compiler, state));
        });
    }

    // 在收集成员时处理索引签名
    let indexSignatureMethods = '';
    node.members.forEach(member => {
        if (ts.isIndexSignatureDeclaration(member)) {
            indexSignatureMethods += handleIndexSignature(member, node.name.getText(), state);
        } else if (ts.isPropertySignature(member)) {
            allMembers.set(member.name.getText(), member);
        } else if (ts.isMethodSignature(member)) {
            allMembers.set(member.name.getText(), member);
            functions += generateMethodExtern(member, node.name.getText());
        }
    });

    // 生成 struct
    const structName = node.name.getText();
    const structDef = `${hasExport ? 'pub(all) ' : ''}struct ${structName} {
  ${Array.from(allMembers.values())
            .map((m) => {
                if (ts.isPropertySignature(m)) {
                    // 使用 cleanPropertyName 处理属性名
                    const propName = cleanPropertyName(m.name.getText());
                    return camelToSnakeCase(propName) + ': ' + typeTransformer(m.type, state);
                } else if (ts.isMethodSignature(m)) {
                    functions += generateMethodExtern(m, structName);
                }
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

// 处理索引签名
function handleIndexSignature(member: ts.IndexSignatureDeclaration, structName: string, state: GeneratorState): string {
    const paramType = typeTransformer(member.parameters[0].type, state);
    const returnType = typeTransformer(member.type, state);

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


// 辅助函数：处理类型参数的约束
export function handleTypeParameter(typeParam: ts.TypeParameterDeclaration, compiler: CompilerState, state: GeneratorState): string {
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

                if (!state.generatedEnums.has(capitalizedEnumName)) {
                    state.generatedEnums.add(capitalizedEnumName);
                    state.enumDefinitions += `enum ${capitalizedEnumName} {
${properties.map(prop => `${formatTypeName(prop.name)}`).join('\n  ')}
}

`;
                }
                return capitalizedEnumName; // 返回首字母大写的枚举名
            }
        }
    }
    return typeTransformer(constraint, state);
}
