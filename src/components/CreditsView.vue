<template>
    <dialog-view v-model="open">
        <template #title>Credits</template>

        <div class="body">
            <a-card :title="'ECIES Implementation'" size="small">
                <div>ECIES implementation by <a href="https://www.npmjs.com/package/eciesjs" target="_blank">eciesjs</a></div>
                <div>License: MIT License</div>
            </a-card>

            <a-card :title="'UI Components'" size="small">
                <div>UI components by <a href="https://www.antdv.com/" target="_blank">Ant Design Vue</a></div>
                <div>License: MIT License</div>
            </a-card>

            <a-card :title="'Dialog View Component'" size="small">
                <div>Dialog view component by <a href="https://www.npmjs.com/package/vue-dialog-view" target="_blank">vue-dialog-view</a></div>
                <div>License: Unlicense</div>
            </a-card>

            <a-card :title="'Vue Framework'" size="small">
                <div>Vue framework by <a href="https://vuejs.org/" target="_blank">Vue.js</a></div>
                <div>License: MIT License</div>
            </a-card>

            <a-card :title="'Vue Router'" size="small">
                <div>Vue Router by <a href="https://router.vuejs.org/" target="_blank">Vue Router</a></div>
                <div>License: MIT License</div>
            </a-card>

            <a-card :title="'Base58 Encoding/Decoding'" size="small">
                <div>Base58 encoding/decoding by <a href="https://www.npmjs.com/package/bs58" target="_blank">bs58</a></div>
                <div>License: MIT License</div>
            </a-card>

            <a-card :title="'LZ-String Compression/Decompression'" size="small">
                <div>LZ-String compression/decompression by <a href="https://www.npmjs.com/package/lz-string" target="_blank">lz-string</a></div>
                <div>License: MIT License</div>
            </a-card>

            <a-card :title="'Internationalization'" size="small">
                <div>Internationalization by <a href="https://www.npmjs.com/package/i18next" target="_blank">i18next</a></div>
                <div>License: MIT License</div>
            </a-card>

            <a-card :title="'TypeScript'" size="small">
                <div>TypeScript by <a href="https://www.typescriptlang.org/" target="_blank">TypeScript</a></div>
                <div>License: Apache License 2.0</div>
            </a-card>

            <a-card :title="'IndexedDB'" size="small">
                <div>IndexedDB by <a href="https://www.npmjs.com/package/idb" target="_blank">idb</a></div>
                <div>License: ISC License</div>
            </a-card>

            <div>
                You can <a href="./licenses@1.0.0.zip" target="_blank">download all the LICENSEs of the above libraries from here</a>.
            </div>
        </div>
    </dialog-view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Card as ACard } from 'ant-design-vue';
import { DialogView } from 'vue-dialog-view';

const props = withDefaults(defineProps<{
    open?: boolean;
}>(), {
    open: false,
});
const emit = defineEmits<{
    (e: 'update:open', value: boolean): void;
}>();

const open = computed({
    get: () => props.open,
    set: (value) => {
        emit('update:open', value);
    },
});

</script>

<style scoped>
.app {
    padding: 1em;
}
.body > :not(:last-child) {
    margin-bottom: .5em;
}
</style>