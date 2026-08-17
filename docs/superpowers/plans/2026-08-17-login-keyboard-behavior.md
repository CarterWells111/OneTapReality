# Login Keyboard Behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep login inputs and actions visible while the keyboard is open and dismiss the keyboard from intentional background or submit-key actions.

**Architecture:** The existing login form remains one screen and keeps its authentication state. A native `KeyboardAvoidingView` wraps a scrollable centered content container. Page background and card non-interactive blank space dismiss the keyboard, while each input and action wrapper stops propagation so interacting with a control does not dismiss it. A verification-code ref and an iOS `InputAccessoryView` provide deterministic next/done keyboard navigation without adding dependencies.

**Tech Stack:** React Native, Expo Router, TypeScript, Jest, React Native Testing Library.

---

### Task 1: Keyboard-safe login layout and dismissal

**Files:**
- Modify: `src/app/login.tsx`
- Modify: `__tests__/login-screen.test.tsx`

- [ ] **Step 1: Add failing behavior tests**

Mock `Keyboard.dismiss` and `Platform.OS`. Assert the screen contains a `KeyboardAvoidingView` with iOS `behavior="padding"`, a `ScrollView` with `keyboardShouldPersistTaps="handled"`, and dismiss targets for both the page background and card non-interactive blank space. Assert input and action wrappers stop propagation, while each action still runs exactly once. Cover iOS and Android branches independently.

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
    <Pressable accessible={false} onPress={Keyboard.dismiss} style={styles.dismissArea}>
      <Pressable accessible={false} onPress={dismissAndStopPropagation} style={styles.card}>
        <View onTouchEnd={(event) => event.stopPropagation()}>
          {/* input or action control */}
        </View>
      </Pressable>
    </Pressable>
  </ScrollView>
</KeyboardAvoidingView>
```

Keep the existing visual centering through `flexGrow: 1` and `justifyContent: "center"`. Allow both page background and card non-interactive blank space to dismiss, while input/button wrappers stop propagation. Add a platform-appropriate `keyboardDismissMode`. Do not add a dependency or change authentication calls.

- [ ] **Step 4: Add failing submit-key tests**

Before a code is sent, submit the email input and expect `Keyboard.dismiss`. After the code field appears, submit the email input and expect `codeInputRef.current.focus()`. Submit the code input and expect `Keyboard.dismiss`, without calling `verifyCode` automatically.

- [ ] **Step 5: Implement keyboard navigation**

Create a `React.useRef<TextInput>(null)` for the code input. Use `returnKeyType={sent ? "next" : "done"}` and `onSubmitEditing={() => sent ? codeInputRef.current?.focus() : Keyboard.dismiss()}` for email; add `ref`, `returnKeyType="done"`, and `onSubmitEditing={Keyboard.dismiss}` to code. Associate the iOS code input with an `InputAccessoryView` containing a visible “完成” control that calls `Keyboard.dismiss`. Preserve the explicit login button and all existing validation.

- [ ] **Step 6: Verify focused GREEN**

Run the Step 2 command and expect all login tests to pass.

### Task 2: Review and repository verification

**Files:**
- Review: `src/app/login.tsx`
- Review: `__tests__/login-screen.test.tsx`

- [ ] **Step 1: Run independent spec and quality reviews**

Confirm page and card blank-space dismissal, control interaction isolation, input focus navigation, the iOS number-pad accessory, keyboard avoidance on both platforms, no authentication behavior change, and accessible dismissal semantics.

- [ ] **Step 2: Run repository gates**

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:ci
npm.cmd run build:server
git diff --check
```

Expected: all commands exit 0. Do not push, open a PR, start an EAS build, or deploy.
