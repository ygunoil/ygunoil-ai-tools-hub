/**
 * Global registry of live TreeNodes.
 */
const treeNodeRegistry = {
    nodes: new Set(),
    activeNode: null,

    register(node) {
        this.nodes.add(node);
    },

    unregister(node) {
        this.nodes.delete(node);
        if (this.activeNode === node) {
            this.activeNode = null;
        }
    },

    /**
     * Highlights `node`, clearing the previous TreeNode.activeNode.
     */
    setActive(node) {
        if (this.activeNode && this.activeNode !== node) {
            this.activeNode.setInactive();
        }
        this.activeNode = node;
    }
};

/**
 * Encapsulates DOM wiring for sidebar folder rows.
 */
class TreeNode {
    /**
     * @param {SmartFolder} folder
     */
    constructor(folder) {
        this.folder = folder;
        this.li = null;
        this.ul = null;
        this.children = [];

        treeNodeRegistry.register(this);
    }

    /**
     * @returns {TreeNode}
     */
    createRoot() {
        this.li = document.createElement('li');
        this.li.className = 'tree-node root-node active';
        this.li.id = 'tree-root-node';

        const count = this.folder.files ? this.folder.files.length : 0;
        this.li.innerHTML = `<i class="fas fa-folder-open"></i> ${this.folder.name} <span class="tree-node-count">(${count})</span>`;

        this.ul = document.createElement('ul');
        this.ul.className = 'tree-sub-list expanded';
        
        domToFolderMap.set(this.li, this.folder);
        domToFolderMap.set(this.ul, this.folder);

        return this;
    }

    /**
     * Standard folder row scaffolding.
     * @returns {TreeNode}
    */
    create() {
        const isEmpty = this.folder.files.length === 0 && this.folder.subFolders.length === 0;

        this.li = document.createElement('li');
        this.li.className = `tree-node ${isEmpty ? 'empty-folder' : ''}`;
        
        const count = this.folder.files.length;
        this.li.innerHTML = `<i class="fas fa-folder-open"></i> ${this.folder.name} <span class="tree-node-count">(${count})</span>`;

        this.ul = document.createElement('ul');
        this.ul.className = 'tree-sub-list expanded';

        domToFolderMap.set(this.li, this.folder);
        domToFolderMap.set(this.ul, this.folder);

        return this;
    }
    
    /**
     * Lightweight row for synthetic folders.
     * @param {Object} options
     * @param {string} options.iconHTML
     * @param {string} options.text
     * @param {Function} options.onClick
     * @param {string} [options.id]
     * @returns {TreeNode}
     */
    createSpecial({ iconHTML, text, onClick, id }) {
        this.li = document.createElement('li');
        this.li.className = 'tree-node';
        if (id) this.li.id = id;
 
        this.li.innerHTML = `${iconHTML} ${text}`;
 
        if (onClick) {
            this.li.addEventListener('click', onClick);
        }
 
        domToFolderMap.set(this.li, this.folder);
 
        return this;
    }

    /**
     * Insert `childNode` sorted by folder name.
     * @param {TreeNode} childNode
    */
   addChild(childNode) {
       if (!this.ul) {
           throw new Error('Parent subtree container missing');
        }
        if (!childNode.li || !childNode.ul) {
            try {
                childNode.create();
            } catch (e) {
                throw new Error('Child TreeNode incomplete and failed to bootstrap');
            }
        }

        if (this.children.includes(childNode)) {
            return;
        }

        const parentUl = this.ul;

        this.children.push(childNode);

        const existingNodes = Array.from(parentUl.querySelectorAll(':scope > li.tree-node'));
        let insertBeforeNode = null;

        for (const node of existingNodes) {
            const nodeData = domToFolderMap.get(node);
            const nodeName = nodeData ? nodeData.name : node.textContent.trim();

            if (windowsCompareStrings(childNode.folder.name, nodeName) < 0) {
                insertBeforeNode = node;
                break;
            }
        }

        if (insertBeforeNode) {
            parentUl.insertBefore(childNode.li, insertBeforeNode);
            parentUl.insertBefore(childNode.ul, insertBeforeNode);
        } else {
            parentUl.appendChild(childNode.li);
            parentUl.appendChild(childNode.ul);
        }
    }

    /**
     * @param {TreeNode} childNode 
     */
    removeChild(childNode) {
        childNode.remove();

        const index = this.children.indexOf(childNode);
        if (index > -1) {
            this.children.splice(index, 1);
        }
    }

    /**
     * Diff helper for synced children.
     * @param {Array<SmartFolder>} subFolders
     */
    async syncChildren(subFolders) {
        const newFolderNames = new Set(subFolders.map(f => f.name));

        const currentChildren = [...this.children];

        for (const childNode of currentChildren) {
            if (!newFolderNames.has(childNode.folder.name)) {
                this.removeChild(childNode);
            }
        }

        const currentFolderNames = new Set(this.children.map(c => c.folder.name));

        for (const subFolder of subFolders) {
            if (!currentFolderNames.has(subFolder.name)) {
                if (!subFolder.treeNode) {
                    console.error('Subfolder missing treeNode', subFolder);
                    continue;
                }

                if (!subFolder.scanned) {
                    await subFolder.scan();
                }

                this.addChild(subFolder.treeNode);
            }
        }
    }


    /**
     * @param {HTMLElement} container
     */
    appendTo(container) {
        if (!this.li) {
            throw new Error('TreeNode missing DOM—call create(), createRoot(), or createSpecial() first');
        }

        container.appendChild(this.li);

        if (this.ul) {
            container.appendChild(this.ul);
        }
    }

    /**
     * Mount into the inferred container (root vs synthetic vs nested).
     * @returns {TreeNode}
     */
    addToUI() {
        if (!this.li) {
            throw new Error('TreeNode missing DOM—call create(), createRoot(), or createSpecial() first');
        }

        let container;

        if (this.li.classList.contains('root-node')) {
            container = UI.treeRoot;
        } else if (this.folder.isVirtual) {
            container = document.querySelector('#virtualContainer ul');
        } else if (this.folder.parent && this.folder.parent.treeNode) {
            container = this.folder.parent.treeNode.getChildContainer();
        } else {
            throw new Error('Unable to determine mount container');
        }

        if (!container) {
            throw new Error('Mount container not found');
        }

        this.appendTo(container);
        return this;
    }

    updateCount() {
        if (!this.li) return;

        const countSpan = this.li.querySelector('.tree-node-count');
        if (countSpan) {
            const count = this.folder.files.length;
            countSpan.textContent = `(${count})`;
        }
    }

    updateIconState() {
        if (!this.li) return;

        const isEmpty = this.folder.files.length === 0 && this.folder.subFolders.length === 0;

        if (isEmpty) {
            this.li.classList.add('empty-folder');
        } else {
            this.li.classList.remove('empty-folder');
        }
    }

    setActive() {
        if (!this.li) return;

        document.querySelectorAll('.tree-node').forEach(node => {
            node.classList.remove('active');
        });

        this.li.classList.add('active');
    }

    toggleExpanded() {
        if (!this.li || !this.ul) return;

        const icon = this.li.querySelector('i');
        const isExpanded = this.ul.classList.contains('expanded');

        if (isExpanded) {
            this.ul.classList.remove('expanded');
            icon.classList.remove('fa-folder-open');
            icon.classList.add('fa-folder');
        } else {
            this.ul.classList.add('expanded');
            icon.classList.remove('fa-folder');
            icon.classList.add('fa-folder-open');
        }
    }

    remove() {
        if (this.ul) {
            this.ul.remove();
            this.ul = null;
        }
        if (this.li) {
            this.li.remove();
            this.li = null;
        }
        this.children = [];

        treeNodeRegistry.unregister(this);
    }

    /**
     * @returns {HTMLElement|null}
     */
    getChildContainer() {
        return this.ul;
    }

    /**
     * @returns {boolean}
     */
    isCreated() {
        return this.li !== null && this.ul !== null;
    }

    setActive() {
        treeNodeRegistry.setActive(this);

        if (this.li) {
            this.li.classList.add('active');
        }
    }

    setInactive() {
        if (this.li) {
            this.li.classList.remove('active');
        }
    }

    setContextActive() {
        if (this.li) {
            this.li.classList.add('context-menu-active');
        }
    }

    setContextInactive() {
        if (this.li) {
            this.li.classList.remove('context-menu-active');
        }
    }

    setDragOver() {
        if (this.li) {
            this.li.classList.add('drag-over');
        }
    }

    setDragLeave() {
        if (this.li) {
            this.li.classList.remove('drag-over');
        }
    }
}

