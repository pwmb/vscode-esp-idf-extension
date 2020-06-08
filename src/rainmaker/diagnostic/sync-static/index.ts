/*
 * Project: ESP-IDF VSCode Extension
 * File Created: Monday, 8th June 2020 10:55:07 am
 * Copyright 2020 Espressif Systems (Shanghai) CO LTD
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *    http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Nm } from "../../../espIdf/tracing/tools/xtensa/nm";
import {
  Uri,
  Disposable,
  window,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  ThemeIcon,
  workspace,
} from "vscode";
import { getElfFilePath } from "../../../utils";
import { Logger } from "../../../logger/logger";

interface StaticVarsModel {
  address: string;
  size: string;
  filePath?: string;
}

export class StaticVarsTreeItem extends TreeItem {
  staticVarsModel?: StaticVarsModel;
}

export class ESPRainmakerStaticVarSyncTreeDataItem
  implements TreeDataProvider<StaticVarsTreeItem> {
  private rootTreeItems: StaticVarsTreeItem[];
  private workspaceRootURI: Uri;
  private bss: Map<string, StaticVarsModel>;
  private data: Map<string, StaticVarsModel>;

  constructor() {
    this.workspaceRootURI = workspace.workspaceFolders
      ? workspace.workspaceFolders[0].uri
      : undefined;
    this.bss = new Map();
    this.data = new Map();
    this.rootTreeItems = this.getRootElements();
    try {
      this.listStaticVars();
    } catch (error) {
      Logger.errorNotify("Failed to fetch list of static vars", error);
    }
  }

  public getTreeItem(element: StaticVarsTreeItem): TreeItem {
    return element;
  }
  public getChildren(root?: StaticVarsTreeItem): StaticVarsTreeItem[] {
    if (!root) {
      return this.rootTreeItems;
    }
    return root.contextValue === "bss"
      ? this.getChildrenFor(this.bss)
      : this.getChildrenFor(this.data);
  }

  public treeDataProvider(name: string): Disposable {
    return window.registerTreeDataProvider(name, this);
  }

  private getChildrenFor(
    map: Map<string, StaticVarsModel>
  ): StaticVarsTreeItem[] {
    const list = new Array<StaticVarsTreeItem>();
    map.forEach((v, k) => {
      list.push({
        label: k,
        description: `${v.address}`,
        tooltip: v.filePath || "",
        contextValue: "variables",
        collapsibleState: TreeItemCollapsibleState.None,
        staticVarsModel: v,
        iconPath: new ThemeIcon("symbol-variable"),
      });
    });
    return list;
  }

  private getRootElements(): StaticVarsTreeItem[] {
    return [
      {
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        contextValue: "bss",
        label: "BSS Section",
        iconPath: new ThemeIcon("file-code"),
        description: "(.bss)",
        tooltip: "Static vars in .bss sections of the .elf file",
      },
      {
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        contextValue: "data",
        label: "Data Section",
        iconPath: new ThemeIcon("file-binary"),
        description: "(.data)",
        tooltip: "Static vars in .data sections of the .elf file",
      },
    ];
  }
  async listStaticVars() {
    const elfFilePath = await getElfFilePath(this.workspaceRootURI);
    const nm = new Nm(this.workspaceRootURI, elfFilePath);
    const resp = await nm.runWith("-l", "-S", elfFilePath);
    const staticVarsFilter = resp
      .toString()
      .match(/^([0-9a-fA-F]{8})\s*([0-9a-fA-F]{8})\s*(b|B|d|D)\s*(.*)$/gm);
    const splitStaticVarsFilter = staticVarsFilter.map((f) => f.split(/\s/));

    splitStaticVarsFilter.forEach((details) => {
      const k = details[3];
      const v = {
        address: details[0],
        size: details[1],
        filePath: details[4],
      };

      if (details[2].match(/d|D/)) {
        this.data.set(k, v);
      } else {
        this.bss.set(k, v);
      }
    });
  }
}
