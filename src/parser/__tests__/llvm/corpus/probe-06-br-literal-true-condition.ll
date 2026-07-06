define void @f() {
entry:
  br i1 true, label %a, label %b
a:
  ret void
b:
  ret void
}
