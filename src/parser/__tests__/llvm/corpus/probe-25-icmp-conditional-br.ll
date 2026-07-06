define void @f(i32 %n) {
entry:
  %cmp = icmp slt i32 %n, 10
  br i1 %cmp, label %a, label %b
a:
  ret void
b:
  ret void
}
