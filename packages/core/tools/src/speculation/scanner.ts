import ts from 'typescript'
import { stableJsonHash } from './key.js'
import type { ToolSpeculationCandidate } from './types.js'

const LITERAL_FAILURE: LiteralResult = { ok: false }
type LiteralResult = { ok: true; value: unknown } | { ok: false }

function literal(value: unknown): LiteralResult {
  return { ok: true, value }
}

function evaluateLiteral(node: ts.Expression): LiteralResult {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return literal(node.text)
  if (ts.isNumericLiteral(node)) {
    if (node.text.endsWith('n')) return LITERAL_FAILURE
    const value = Number(node.text)
    return Number.isFinite(value) ? literal(value) : LITERAL_FAILURE
  }
  if (ts.isPrefixUnaryExpression(node)
    && (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken)
    && ts.isNumericLiteral(node.operand)) {
    if (node.operand.text.endsWith('n')) return LITERAL_FAILURE
    const value = Number(node.operand.text)
    if (!Number.isFinite(value)) return LITERAL_FAILURE
    return literal(node.operator === ts.SyntaxKind.MinusToken ? -value : value)
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return literal(true)
  if (node.kind === ts.SyntaxKind.FalseKeyword) return literal(false)
  if (node.kind === ts.SyntaxKind.NullKeyword) return literal(null)
  if (ts.isArrayLiteralExpression(node)) {
    const result: unknown[] = []
    for (const element of node.elements) {
      if (ts.isSpreadElement(element) || ts.isOmittedExpression(element)) return LITERAL_FAILURE
      const item = evaluateLiteral(element)
      if (!item.ok) return item
      result.push(item.value)
    }
    return literal(result)
  }
  if (ts.isObjectLiteralExpression(node)) {
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) return LITERAL_FAILURE
      const name = property.name
      if (!ts.isIdentifier(name) && !ts.isStringLiteral(name) && !ts.isNumericLiteral(name)) return LITERAL_FAILURE
      const item = evaluateLiteral(property.initializer)
      if (!item.ok) return item
      Object.defineProperty(result, name.text, { enumerable: true, configurable: true, writable: true, value: item.value })
    }
    return literal(result)
  }
  return LITERAL_FAILURE
}

function collectBoundNames(name: ts.BindingName, names: Set<string>): void {
  if (ts.isIdentifier(name)) {
    names.add(name.text)
    return
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) collectBoundNames(element.name, names)
  }
}

function toolName(expression: ts.LeftHandSideExpression, tainted: boolean): string | undefined {
  if (tainted) return undefined
  if (ts.isPropertyAccessExpression(expression)
    && ts.isIdentifier(expression.expression)
    && expression.expression.text === 'tools') return expression.name.text
  if (ts.isElementAccessExpression(expression)
    && ts.isIdentifier(expression.expression)
    && expression.expression.text === 'tools') {
    const key = evaluateLiteral(expression.argumentExpression)
    return key.ok && typeof key.value === 'string' && key.value.length > 0 ? key.value : undefined
  }
  return undefined
}

/**
 * Reparse a growing TypeScript prefix only when a call may have completed, and
 * emit direct `tools.name({...})` calls whose single argument is JSON-literal.
 */
export class LiteralToolCallScanner {
  private scannedLength = 0
  private toolsTainted = false
  private readonly emitted = new Set<string>()

  /**
   * Scan a growing code prefix for newly completed, direct literal tool calls.
   * @param code - the complete TypeScript prefix received so far.
   * @returns candidates not emitted by an earlier scan.
   */
  push(code: string): ToolSpeculationCandidate[] {
    const appended = code.slice(this.scannedLength)
    const force = code.length < this.scannedLength
    if (!force && !appended.includes(')')) return []
    this.scannedLength = code.length

    const source = ts.createSourceFile('speculation.ts', code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS)
    for (const statement of source.statements) this.collectBindings(statement)

    const candidates: ToolSpeculationCandidate[] = []
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const complete = node.getLastToken(source)?.kind === ts.SyntaxKind.CloseParenToken
        const name = complete ? toolName(node.expression, this.toolsTainted) : undefined
        const argumentsValue = name === undefined ? undefined : this.literalArguments(node)
        if (name !== undefined && argumentsValue !== undefined) {
          const key = `${name}\n${stableJsonHash(argumentsValue)}`
          if (!this.emitted.has(key)) {
            this.emitted.add(key)
            candidates.push({ name, arguments: argumentsValue })
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    return candidates
  }

  private literalArguments(node: ts.CallExpression): Record<string, unknown> | undefined {
    if (node.arguments.length === 0) return {}
    if (node.arguments.length !== 1) return undefined
    const argument = node.arguments.at(0)
    if (argument === undefined || ts.isSpreadElement(argument)) return undefined
    const result = evaluateLiteral(argument)
    return result.ok && typeof result.value === 'object' && result.value !== null && !Array.isArray(result.value)
      ? result.value as Record<string, unknown>
      : undefined
  }

  private collectBindings(node: ts.Node): void {
    const visit = (current: ts.Node): void => {
      if (ts.isVariableDeclaration(current)) {
        const names = new Set<string>()
        collectBoundNames(current.name, names)
        if (names.has('tools')) this.toolsTainted = true
      } else if ((ts.isFunctionDeclaration(current) || ts.isClassDeclaration(current)) && current.name?.text === 'tools') {
        this.toolsTainted = true
      } else if (ts.isFunctionExpression(current) || ts.isArrowFunction(current) || ts.isMethodDeclaration(current)) {
        for (const parameter of current.parameters) {
          const names = new Set<string>()
          collectBoundNames(parameter.name, names)
          if (names.has('tools')) this.toolsTainted = true
        }
      } else if (ts.isImportDeclaration(current) && current.importClause !== undefined) {
        const clause = current.importClause
        if (clause.name?.text === 'tools') this.toolsTainted = true
        if (clause.namedBindings !== undefined) {
          if (ts.isNamespaceImport(clause.namedBindings)) {
            if (clause.namedBindings.name.text === 'tools') this.toolsTainted = true
          } else if (clause.namedBindings.elements.some(element => element.name.text === 'tools')) {
            this.toolsTainted = true
          }
        }
      }
      ts.forEachChild(current, visit)
    }
    visit(node)
  }
}
