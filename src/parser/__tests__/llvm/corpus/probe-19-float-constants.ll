define double @f(double %x) {
  %y = fadd double %x, 1.000000e+00
  %z = fadd double %y, -2.5
  ret double %z
}
