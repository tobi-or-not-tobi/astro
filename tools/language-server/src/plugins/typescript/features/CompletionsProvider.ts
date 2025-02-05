import { isInsideFrontmatter } from '../../../core/documents/utils';
import { Document } from '../../../core/documents';
import * as ts from 'typescript';
import { CompletionContext, CompletionList, CompletionItem, Position, TextDocumentIdentifier, TextEdit, MarkupKind, MarkupContent } from 'vscode-languageserver';
import { AppCompletionItem, AppCompletionList, CompletionsProvider } from '../../interfaces';
import type { LanguageServiceManager } from '../LanguageServiceManager';
import { scriptElementKindToCompletionItemKind, getCommitCharactersForScriptElement } from '../utils';

export interface CompletionEntryWithIdentifer extends ts.CompletionEntry, TextDocumentIdentifier {
  position: Position;
}

export class CompletionsProviderImpl implements CompletionsProvider<CompletionEntryWithIdentifer> {
  constructor(private lang: LanguageServiceManager) {}

  async getCompletions(document: Document, position: Position, completionContext?: CompletionContext): Promise<AppCompletionList<CompletionEntryWithIdentifer> | null> {
    // TODO: handle inside expression
    if (!isInsideFrontmatter(document.getText(), document.offsetAt(position))) {
      return null;
    }

    const filePath = document.getFilePath();
    if (!filePath) throw new Error();

    const { tsDoc, lang } = await this.lang.getTypeScriptDoc(document);
    const fragment = await tsDoc.getFragment();

    const offset = document.offsetAt(position);
    const entries =
      lang.getCompletionsAtPosition(fragment.filePath, offset, {
        importModuleSpecifierPreference: 'relative',
        importModuleSpecifierEnding: 'js',
        quotePreference: 'single',
      })?.entries || [];

    const completionItems = entries
      .map((entry: ts.CompletionEntry) => this.toCompletionItem(fragment, entry, document.uri, position, new Set()))
      .filter((i) => i) as CompletionItem[];

    return CompletionList.create(completionItems, true);
  }

  async resolveCompletion(document: Document, completionItem: AppCompletionItem<CompletionEntryWithIdentifer>): Promise<AppCompletionItem<CompletionEntryWithIdentifer>> {
    const { data: comp } = completionItem;
    const { tsDoc, lang } = await this.lang.getTypeScriptDoc(document);

    let filePath = tsDoc.filePath;

    if (!comp || !filePath) {
      return completionItem;
    }

    if (filePath.endsWith('.astro')) {
      filePath = filePath + '.ts';
    }

    const fragment = await tsDoc.getFragment();
    const detail = lang.getCompletionEntryDetails(filePath, fragment.offsetAt(comp.position), comp.name, {}, comp.source, {}, undefined);

    if (detail) {
      const { detail: itemDetail, documentation: itemDocumentation } = this.getCompletionDocument(detail);

      completionItem.detail = itemDetail;
      completionItem.documentation = itemDocumentation;
    }

    // const actions = detail?.codeActions;
    // const isImport = !!detail?.source;

    // TODO: handle actions
    // if (actions) {
    //   const edit: TextEdit[] = [];

    //   for (const action of actions) {
    //     for (const change of action.changes) {
    //       edit.push(
    //         ...this.codeActionChangesToTextEdit(
    //           document,
    //           fragment,
    //           change,
    //           isImport,
    //           isInsideFrontmatter(fragment.getFullText(), fragment.offsetAt(comp.position))
    //         )
    //       );
    //     }
    //   }

    //   completionItem.additionalTextEdits = edit;
    // }

    return completionItem;
  }

  private toCompletionItem(
    fragment: any,
    comp: ts.CompletionEntry,
    uri: string,
    position: Position,
    existingImports: Set<string>
  ): AppCompletionItem<CompletionEntryWithIdentifer> | null {
    return {
      label: comp.name,
      insertText: comp.insertText,
      kind: scriptElementKindToCompletionItemKind(comp.kind),
      commitCharacters: getCommitCharactersForScriptElement(comp.kind),
      // Make sure svelte component takes precedence
      sortText: comp.sortText,
      preselect: comp.isRecommended,
      // pass essential data for resolving completion
      data: {
        ...comp,
        uri,
        position,
      },
    };
  }

  private getCompletionDocument(compDetail: ts.CompletionEntryDetails) {
    const { source, documentation: tsDocumentation, displayParts, tags } = compDetail;
    let detail: string = ts.displayPartsToString(displayParts);

    if (source) {
      const importPath = ts.displayPartsToString(source);
      detail = `Auto import from ${importPath}\n${detail}`;
    }

    const documentation: MarkupContent | undefined = tsDocumentation ? { value: tsDocumentation.join('\n'), kind: MarkupKind.Markdown } : undefined;

    return {
      documentation,
      detail,
    };
  }
}
