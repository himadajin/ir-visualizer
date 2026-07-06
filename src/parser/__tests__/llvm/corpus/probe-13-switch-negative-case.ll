define void @f(i32 %v) {
  switch i32 %v, label %d [
    i32 -1, label %a
  ]
a:
  ret void
d:
  ret void
}
