/*
 * Project: ESP-IDF VSCode Extension
 * File Created: Wednesday, 13th May 2020 12:45:38 pm
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

import { ExtensionContext } from "vscode";

export class RainmakerStore {
  private static self: RainmakerStore;
  private ctx: ExtensionContext;

  public static init(context: ExtensionContext): RainmakerStore {
    if (!this.self) {
      return new RainmakerStore(context);
    }
    return this.self;
  }
  private constructor(context: ExtensionContext) {
    this.ctx = context;
  }
  public get<T>(key: string, defaultValue?: T): T {
    return this.ctx.globalState.get<T>(key, defaultValue);
  }
  public set(key: string, value: any) {
    this.ctx.globalState.update(key, value);
  }
  public clear(key: string) {
    return this.set(key, undefined);
  }
}
