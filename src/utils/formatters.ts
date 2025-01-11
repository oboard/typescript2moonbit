// 处理命名和格式化相关的函数

// 保留字列表
export const RESERVED_WORDS = new Set([
    'type', 'fn', 'let', 'mut', 'pub', 'trait', 'impl', 'enum',
    'struct', 'match', 'if', 'else', 'while', 'for', 'in',
    'return', 'break', 'continue'
]);

export function formatTypeName(typeName: string): string {
    const formatted = typeName
        .replace(/\[/g, 'Of')
        .replace(/\]/g, '')
        .replace(/,\s*/g, 'And')
        .replace(/[<>]/g, 'Of')
        .replace(/\s+/g, '')
        .replace(/[^\w]/g, '');

    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function camelToSnakeCase(name: string): string {
    if (name === name.toUpperCase()) {
        const lowercased = name.toLowerCase();
        return RESERVED_WORDS.has(lowercased) ? '_' + lowercased : lowercased;
    }

    const snakeCase = name
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .replace(/([a-z\d])([A-Z])/g, '$1_$2')
        .replace(/^_/, '')
        .toLowerCase();

    return RESERVED_WORDS.has(snakeCase) ? '_' + snakeCase : snakeCase;
}

export function cleanPropertyName(name: string): string {
    return name
        .replace(/['"]/g, '')
        .replace(/-/g, '_minus_')
        .replace(/\+/g, '_plus_')
        .replace(/\*/g, '_star_')
        .replace(/\//g, '_slash_')
        .replace(/\./g, '_dot_')
        .replace(/\?/g, '_question_')
        .replace(/!/g, '_exclamation_')
        .replace(/@/g, '_at_')
        .replace(/#/g, '_hash_')
        .replace(/\$/g, '_dollar_')
        .replace(/%/g, '_percent_')
        .replace(/\^/g, '_caret_')
        .replace(/&/g, '_and_')
        .replace(/\s+/g, '_')
        .replace(/[^\w_]/g, '');
} 