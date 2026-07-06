@.str = internal constant [4 x i8] c"hi\0A\00"
define i32 @main() {
entry:
  %p = getelementptr [4 x i8]* @.str, i64 0, i64 0
  %v = load i8* %p
  ret i32 0
}
