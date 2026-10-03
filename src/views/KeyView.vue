<template>
    <KeyLibraryDialog v-model:open="dialogOpen" />
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";

import KeyLibraryDialog from "@/components/KeyLibraryDialog.vue";

const router = useRouter();
const open = ref(true);

const leavePage = () => {
    if (window.history.length > 1) router.back();
    else void router.replace("/");
};

const dialogOpen = computed({
    get: () => open.value,
    set: (value: boolean) => {
        if (value) {
            open.value = true;
            return;
        }
        open.value = false;
        leavePage();
    },
});
</script>
