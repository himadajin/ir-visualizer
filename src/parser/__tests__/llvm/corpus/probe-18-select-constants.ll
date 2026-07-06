define i32 @f(i1 %c) {
  %x = select i1 %c, i32 1, i32 0
  ret i32 %x
}
