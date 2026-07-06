; LLVM 2.x flavor: typed pointers, function-pointer call type on the invoke,
; a one-line invoke, and the old `unwind` terminator.
@.str = internal constant [13 x i8] c"hello world\0A\00"

declare i32 @printf(i8*, ...)

define i32 @main() {
entry:
  %r = invoke i32 (i8*, ...)* @printf(i8* getelementptr ([13 x i8]* @.str, i32 0, i32 0)) to label %ok unwind label %err

ok:
  ret i32 %r

err:
  unwind
}
