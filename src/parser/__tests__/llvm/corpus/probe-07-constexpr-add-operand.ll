@g = global i32 0
define i32 @f() {
  %x = add i32 ptrtoint (i32* @g to i32), 1
  ret i32 %x
}
