@.str = constant [4 x i8] c"hi\0A\00"
define i32 @main() {
  %c = call i32 @puts(i8* getelementptr ([4 x i8], [4 x i8]* @.str, i32 0, i32 0))
  ret i32 0
}
