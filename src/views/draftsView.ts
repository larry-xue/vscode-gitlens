import type { Disposable } from 'vscode';
import { TreeItem, TreeItemCollapsibleState, window } from 'vscode';
import type { RepositoriesViewConfig } from '../config';
import { Commands } from '../constants';
import type { Container } from '../container';
import { unknownGitUri } from '../git/gitUri';
import { showPatchesView } from '../plus/drafts/actions';
import { ensurePlusFeaturesEnabled } from '../plus/gk/utils';
import { executeCommand } from '../system/command';
import { CacheableChildrenViewNode } from './nodes/abstract/cacheableChildrenViewNode';
import type { ViewNode } from './nodes/abstract/viewNode';
import { DraftNode } from './nodes/draftNode';
import { ViewBase } from './viewBase';
import { registerViewCommand } from './viewCommands';

export class DraftsViewNode extends CacheableChildrenViewNode<'drafts', DraftsView, DraftNode> {
	constructor(view: DraftsView) {
		super('drafts', unknownGitUri, view);
	}

	async getChildren(): Promise<ViewNode[]> {
		if (this.children == null) {
			const children: DraftNode[] = [];

			const drafts = await this.view.container.drafts.getDrafts();
			drafts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
			for (const draft of drafts) {
				children.push(new DraftNode(this.uri, this.view, this, draft));
			}

			this.children = children;
		}

		return this.children;
	}

	getTreeItem(): TreeItem {
		const item = new TreeItem('Drafts', TreeItemCollapsibleState.Expanded);
		return item;
	}
}

export class DraftsView extends ViewBase<'drafts', DraftsViewNode, RepositoriesViewConfig> {
	protected readonly configKey = 'drafts';
	private _disposable: Disposable | undefined;

	constructor(container: Container) {
		super(container, 'drafts', 'Cloud Patches', 'draftsView');

		this.description = `PREVIEW\u00a0\u00a0☁️`;
	}

	override dispose() {
		this._disposable?.dispose();
		super.dispose();
	}

	override get canSelectMany(): boolean {
		return false;
	}

	protected getRoot() {
		return new DraftsViewNode(this);
	}

	override async show(options?: { preserveFocus?: boolean | undefined }): Promise<void> {
		if (!(await ensurePlusFeaturesEnabled())) return;

		// if (this._disposable == null) {
		// 	this._disposable = Disposable.from(
		// 		this.container.drafts.onDidResetDrafts(() => void this.ensureRoot().triggerChange(true)),
		// 	);
		// }

		return super.show(options);
	}

	override get canReveal(): boolean {
		return false;
	}

	protected registerCommands(): Disposable[] {
		void this.container.viewCommands;

		return [
			// registerViewCommand(
			// 	this.getQualifiedCommand('info'),
			// 	() => env.openExternal(Uri.parse('https://help.gitkraken.com/gitlens/side-bar/#drafts-☁%ef%b8%8f')),
			// 	this,
			// ),
			registerViewCommand(
				this.getQualifiedCommand('copy'),
				() => executeCommand(Commands.ViewsCopy, this.activeSelection, this.selection),
				this,
			),
			registerViewCommand(
				this.getQualifiedCommand('refresh'),
				() => {
					// this.container.drafts.resetDrafts();
				},
				this,
			),
			registerViewCommand(
				this.getQualifiedCommand('create'),
				async () => {
					await executeCommand(Commands.CreateCloudPatch);
					void this.ensureRoot().triggerChange(true);
				},
				this,
			),
			registerViewCommand(
				this.getQualifiedCommand('delete'),
				async (node: DraftNode) => {
					const confirm = { title: 'Delete' };
					const cancel = { title: 'Cancel', isCloseAffordance: true };
					const result = await window.showInformationMessage(
						`Are you sure you want to delete draft '${node.draft.title}'?`,
						{ modal: true },
						confirm,
						cancel,
					);

					if (result === confirm) {
						await this.container.drafts.deleteDraft(node.draft.id);
						void node.getParent()?.triggerChange(true);
					}
				},
				this,
			),
			registerViewCommand(
				this.getQualifiedCommand('open'),
				async (node: DraftNode) => {
					let draft = node.draft;
					if (draft.changesets == null) {
						draft = await this.container.drafts.getDraft(node.draft.id);
					}
					void showPatchesView({ mode: 'draft', draft: draft });
				},
				this,
			),
		];
	}
}