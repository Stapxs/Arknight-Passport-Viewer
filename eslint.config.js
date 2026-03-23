import tseslint from 'typescript-eslint'

export default tseslint.config(
    // 忽略产物目录
    {
        ignores: ['dist/**', 'node_modules/**'],
    },
    // TypeScript 推荐规则集
    ...tseslint.configs.recommended,
    // 自定义规则
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        },
    },
)
