/*
 * Project: ESP-IDF VSCode Extension
 * File Created: Thursday, 11th July 2019 11:16:46 am
 * Copyright 2019 Espressif Systems (Shanghai) CO LTD
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

import "./espTrace.scss";

import Vue from "vue";

// Vue App
const app = new Vue({
    el: "#app",
    data: {
        openOcdServerRunning: true,
        // tslint:disable-next-line: max-line-length
        subtitle: "App Tracing Reporter will help you with in-depth analysis of the runtime. In a nutshell this feature allows you to transfer arbitrary data between host and ESP32 via JTAG interface with small overhead on program execution.",
        title: "<strong>ESP-IDF</strong>&nbsp;App Tracing Reporter",
        fileName: "",
    },
});

const updateModelWithTraceData = (trace) => {
    if (trace) {
        app.fileName = trace.fileName;
    }
};

// Message Receiver
declare var window: any;
window.addEventListener("message", (m: any) => {
    const msg = m.data;
    updateModelWithTraceData(msg.trace);
});
