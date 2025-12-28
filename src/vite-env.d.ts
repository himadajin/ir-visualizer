/// <reference types="vite/client" />

declare module '*.ohm?raw' {
    const content: string;
    export default content;
}
