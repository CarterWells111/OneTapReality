# Login Keyboard Behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep login inputs and actions visible while the keyboard is open and dismiss the keyboard from intentional background or submit-key actions.

**Architecture:** The existing login form remains one screen and keeps its authentication state. A native `KeyboardAvoidingView` wraps a scrollable centered content container, while a background press target dismisses the keyboard and the card absorbs internal presses. A verification-code ref provides deterministic next/done keyboard navigation without adding dependencies.

**Tech Stack:** React Native, Expo Router, TypeScript, Jest, React Native Testing Library.

---

### Task 1: Keyboard-safe login layout and dismissal

**Files:**
- Modify: `src/app/login.tsx`
- Modify: `__tests__/login-screen.test.tsx`

- [ ] **Step 1: Add failing behavior tests**

Mock `Keyboard.dismiss` and `Platform.OS`. Assert the screen contains a `KeyboardAvoidingView` with iOS `behavior="padding"`, a `ScrollView` with `keyboardShouldPersistTaps="handled"`, and a background press target. Pressing the background must call dismiss; pressing the card or an input must not invoke the background handler.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm.cmd exec -- jest --runInBand --runTestsByPath __tests__/login-screen.test.tsx
```

Expected: FAIL because the current screen is a fixed `View` and has no keyboard dismissal contract.

- [ ] **Step 3: Implement the native layout**

Use these native components and props:

```tsx
<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
  <ScrollView
    contentContainerStyle={styles.scrollContent}
    keyboardShouldPersistTaps="handled"
  >
    <Pressable accessibilityLabel="关闭键盘" onPress={Keyboard.dismiss} style={styles.dismissArea}>
      <Pressable onPress={(event) => event.stopPropagation()} style={styles.card}>
        {/* existing form */}
      </Pressable>
    </Pressable>
  </ScrollView>
</KeyboardAvoidingView>
```

Keep the existing visual centering through `flexGrow: 1` and `justifyContent: "center"`. Do not add a dependency or change authentication calls.

- [ ] **Step 4: Add failing submit-key tests**

Before a code is sent, submit the email input and expect `Keyboard.dismiss`. After the code field appears, submit the email input and expect `codeInputRef.current.focus()`. Submit the code input and expect `Keyboard.dismiss`, without calling `verifyCode` automatically.

- [ ] **Step 5: Implement keyboard navigation**

Create a `React.useRef<TextInput>(null)` for the code input. Add `returnKeyType="next"` and `onSubmitEditing={() => sent ? codeInputRef.current?.focus() : Keyboard.dismiss()}` to email; add `ref`, `returnKeyType="done"`, and `onSubmitEditing={Keyboard.dismiss}` to code. Preserve the explicit login button and all existing validation.

- [ ] **Step 6: Verify focused GREEN**

Run the Step 2 command and expect all login tests to pass.

### Task 2: Review and repository verification

**Files:**
- Review: `src/app/login.tsx`
- Review: `__tests__/login-screen.test.tsx`

- [ ] **Step 1: Run independent spec and quality reviews**

Confirm background-only dismissal, input focus navigation, keyboard avoidance on both platforms, no authentication behavior change, and accessible dismissal semantics.

- [ ] **Step 2: Run repository gates**

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:ci
npm.cmd run build:server
git diff --check
```

Expected: all commands exit 0. Do not push, open a PR, start an EAS build, or deploy.
