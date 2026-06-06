export function toast(message: string) {
  if (typeof window !== "undefined") {
    window.alert(message);
  }
}

