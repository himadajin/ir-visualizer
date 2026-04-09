export const llvmMinimalRet = `
define void @main() {
  ret void
}`;

export const llvmParamsFunction = `
define i32 @add(i32 %a, i32 %b) {
  ret i32 %a
}`;

export const llvmWithEntryAndRet = `
define void @foo() {
entry:
  ret void
}`;

export const llvmWithConditionalBranch = `
define void @foo(i1 %cond) {
entry:
  br i1 %cond, label %then, label %else

then:
  ret void

else:
  ret void
}`;

export const llvmWithSwitch = `
define void @foo(i32 %val) {
entry:
  switch i32 %val, label %default [
    i32 0, label %case0
    i32 1, label %case1
  ]

case0:
  ret void

case1:
  ret void

default:
  ret void
}`;

export const llvmComplexModule = `
source_filename = "test.c"
target triple = "x86_64-unknown-linux-gnu"

@g = global i32 0

declare void @printf()

define i32 @main() {
entry:
  %x = add i32 1, 2
  ret i32 %x
}

attributes #0 = { nounwind }

!0 = !{i32 1}`;
